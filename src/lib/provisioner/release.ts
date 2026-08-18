import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { db } from "@/db";
import { deployments, envVars, gitConnections, releases, releaseLogs } from "@/db/schema";
import { newId } from "@/lib/id";
import { open as unseal } from "@/lib/crypto";
import { downloadTarball, gitMode } from "@/lib/git";
import type { LogLevel } from "./log";
import {
  assumeCustomerRole,
  deleteCustomerStack,
  friendlyAwsError,
  updateFunctionCode,
  updateFunctionEnv,
  waitForFunctionUpdated,
} from "./aws";

/**
 * The CI/CD unit of work. Same tick-driven state machine as provisioning:
 *
 *   push/manual: queued ─▶ building ─▶ deploying ─▶ completed
 *   pr_close:    queued ─▶ tearing_down ─▶ completed (environment removed)
 *                     └──────────┴─────────▶ failed
 *
 * Claiming is atomic (UPDATE…RETURNING + stale-lock takeover), so the resident
 * worker and the cron endpoint can run side by side without double-deploys.
 *
 * v1 build contract (deliberate scope cut): the repo's `lambda/` directory
 * (or `index.mjs` at the root) is zipped AS-IS, no `npm ci`, no bundler.
 * Dependencies must be committed/bundled by the customer. Running untrusted
 * customer builds requires an isolated build sandbox, that's a Phase 1.5
 * infrastructure piece, not something to fake inside the control plane.
 */

const LOCK_STALE_MS = 3 * 60 * 1000;
const MAX_POLLS = 60;

export async function appendReleaseLog(
  releaseId: string,
  level: LogLevel,
  message: string,
  data?: Record<string, unknown>
) {
  await db.insert(releaseLogs).values({ id: newId("rlog"), releaseId, level, message, data });
}

export interface ReleaseTickResult {
  claimed: number;
  advanced: string[];
}

export async function processReleaseTick(): Promise<ReleaseTickResult> {
  const mode = process.env.PROVISIONER_MODE === "live" ? "live" : "mock";
  const staleBefore = new Date(Date.now() - LOCK_STALE_MS);

  const claimable = await db
    .update(releases)
    .set({ lockedAt: new Date() })
    .where(
      and(
        inArray(releases.status, ["queued", "building", "deploying", "tearing_down"]),
        or(isNull(releases.lockedAt), lt(releases.lockedAt, staleBefore))
      )
    )
    .returning();

  const advanced: string[] = [];
  for (const rel of claimable) {
    try {
      if (rel.pollCount >= MAX_POLLS) {
        throw new Error("Release timed out. Re-run it from the environment page.");
      }
      if (rel.trigger === "pr_close") {
        await stepTeardown(rel, mode);
      } else if (mode === "mock") {
        await stepMock(rel);
      } else {
        await stepLive(rel);
      }
      advanced.push(rel.id);
    } catch (err) {
      const friendly = friendlyAwsError(err);
      await appendReleaseLog(rel.id, "error", friendly, { raw: String(err) });
      await db
        .update(releases)
        .set({ status: "failed", errorMessage: friendly, finishedAt: new Date(), lockedAt: null })
        .where(eq(releases.id, rel.id));
    }
  }
  return { claimed: claimable.length, advanced };
}

type Release = typeof releases.$inferSelect;

async function unlock(id: string, patch: Partial<typeof releases.$inferInsert> = {}) {
  await db
    .update(releases)
    .set({ ...patch, lockedAt: null, pollCount: (patch.pollCount as number) ?? undefined })
    .where(eq(releases.id, id));
}

async function loadEnvironment(rel: Release) {
  const env = await db.query.deployments.findFirst({
    where: eq(deployments.id, rel.environmentId),
  });
  if (!env) throw new Error("The environment for this release no longer exists.");
  return env;
}

/** Decrypt the environment's stored vars for injection into Lambda config. */
async function decryptedEnvVars(environmentId: string): Promise<Record<string, string>> {
  const rows = await db.query.envVars.findMany({
    where: eq(envVars.environmentId, environmentId),
  });
  const out: Record<string, string> = {};
  for (const row of rows) out[row.key] = unseal(row.valueEncrypted);
  return out;
}

// ── Mock pipeline, full state machine, honest simulation ────────────────────

async function stepMock(rel: Release) {
  const env = await loadEnvironment(rel);
  const sha7 = rel.gitSha.slice(0, 7);

  if (rel.status === "queued") {
    await appendReleaseLog(rel.id, "info", `Release started for ${env.stackName} @ ${sha7} (${rel.trigger}).`);
    await appendReleaseLog(
      rel.id,
      "info",
      gitMode() === "mock"
        ? "[simulation] Downloading source tarball from GitHub…"
        : "Downloading source tarball from GitHub…"
    );
    await unlock(rel.id, { status: "building", startedAt: new Date(), pollCount: rel.pollCount + 1 });
    return;
  }
  if (rel.status === "building") {
    await appendReleaseLog(rel.id, "info", "[simulation] Packaging lambda/ into function bundle (2.1 MB)…");
    await appendReleaseLog(rel.id, "success", "[simulation] Bundle ready.");
    await unlock(rel.id, { status: "deploying", pollCount: rel.pollCount + 1 });
    return;
  }
  if (rel.status === "deploying") {
    const vars = await decryptedEnvVars(env.id);
    await appendReleaseLog(
      rel.id,
      "info",
      `[simulation] UpdateFunctionCode → ${env.stackName}-api … LastUpdateStatus=Successful`
    );
    await appendReleaseLog(
      rel.id,
      "info",
      `[simulation] Injected ${Object.keys(vars).length} environment variable(s) into function config.`
    );
    await appendReleaseLog(rel.id, "success", `[simulation] Smoke test GET /health → 200. ${sha7} is live.`);
    await db
      .update(deployments)
      .set({ currentSha: rel.gitSha, gitBranch: rel.gitRef.replace("refs/heads/", "") })
      .where(eq(deployments.id, env.id));
    await unlock(rel.id, { status: "completed", finishedAt: new Date() });
    return;
  }
}

// ── Live pipeline ────────────────────────────────────────────────────────────

async function stepLive(rel: Release) {
  const env = await loadEnvironment(rel);
  const sha7 = rel.gitSha.slice(0, 7);

  if (rel.status === "queued") {
    await appendReleaseLog(rel.id, "info", `Release started for ${env.stackName} @ ${sha7} (${rel.trigger}).`);
    await unlock(rel.id, { status: "building", startedAt: new Date(), pollCount: rel.pollCount + 1 });
    return;
  }

  if (rel.status === "building") {
    const conn = await db.query.gitConnections.findFirst({
      where: eq(gitConnections.orgId, rel.orgId),
    });
    if (!conn) throw new Error("No git connection on file for this organization.");
    if (!conn.installationId) {
      throw new Error("The GitHub App isn't installed on this repository yet. Finish the connection on the Git page.");
    }

    await appendReleaseLog(rel.id, "info", `Downloading ${conn.repoFullName} @ ${sha7}…`);
    const tarball = await downloadTarball({
      installationId: conn.installationId,
      repoFullName: conn.repoFullName,
      sha: rel.gitSha,
    });
    if (!tarball) throw new Error("GIT_MODE is mock but PROVISIONER_MODE is live, set GitHub App credentials to deploy real code.");

    const zip = await packageLambdaBundle(rel.id, tarball);
    // Stash the bundle for the deploying step via a temp file reference in memory:
    // ticks are stateless across processes, so build+deploy happen in one step.
    await appendReleaseLog(rel.id, "info", "Deploying bundle to Lambda…");

    const externalId = String(env.config.externalId ?? "");
    const conn2 = { roleArn: String(env.config.roleArn ?? "") };
    const creds = await assumeCustomerRole({
      roleArn: conn2.roleArn,
      externalId,
      sessionName: `diab-release-${sha7}`,
    });
    const functionName = `${env.stackName}-api`;
    await updateFunctionCode({ region: env.region, creds, functionName, zip });
    await waitForFunctionUpdated({ region: env.region, creds, functionName });
    await appendReleaseLog(rel.id, "success", "Function code updated.");

    const vars = await decryptedEnvVars(env.id);
    if (Object.keys(vars).length > 0) {
      await updateFunctionEnv({ region: env.region, creds, functionName, variables: vars });
      await waitForFunctionUpdated({ region: env.region, creds, functionName });
      await appendReleaseLog(rel.id, "success", `Injected ${Object.keys(vars).length} environment variable(s).`);
    }
    await unlock(rel.id, { status: "deploying", pollCount: rel.pollCount + 1 });
    return;
  }

  if (rel.status === "deploying") {
    // Smoke test the environment's live endpoint.
    const outputs = (env.outputs ?? {}) as Record<string, string>;
    const endpoint = outputs.ApiEndpoint;
    if (endpoint) {
      const res = await fetch(`${endpoint.replace(/\/$/, "")}/health`).catch(() => null);
      if (res?.ok) {
        await appendReleaseLog(rel.id, "success", `Smoke test GET /health → ${res.status}. ${sha7} is live.`);
      } else {
        throw new Error(
          `Smoke test failed (${res ? `HTTP ${res.status}` : "no response"}). The previous code is likely still serving; check the function logs.`
        );
      }
    } else {
      await appendReleaseLog(rel.id, "warn", "No ApiEndpoint output on this environment, skipping smoke test.");
    }
    await db
      .update(deployments)
      .set({ currentSha: rel.gitSha, gitBranch: rel.gitRef.replace("refs/heads/", "") })
      .where(eq(deployments.id, env.id));
    await unlock(rel.id, { status: "completed", finishedAt: new Date() });
    return;
  }
}

// ── Preview teardown (pr_close) ──────────────────────────────────────────────

async function stepTeardown(rel: Release, mode: "mock" | "live") {
  const env = await loadEnvironment(rel);

  if (rel.status === "queued") {
    await appendReleaseLog(rel.id, "info", `PR closed, tearing down preview ${env.stackName}.`);
    if (mode === "live") {
      const creds = await assumeCustomerRole({
        roleArn: String(env.config.roleArn ?? ""),
        externalId: String(env.config.externalId ?? ""),
        sessionName: `diab-teardown-${env.stackName}`,
      });
      await deleteCustomerStack({ region: env.region, creds, stackName: env.stackName });
      await appendReleaseLog(rel.id, "info", "DeleteStack issued. CloudFormation is removing resources…");
    } else {
      await appendReleaseLog(rel.id, "info", "[simulation] DeleteStack issued.");
    }
    await unlock(rel.id, { status: "tearing_down", startedAt: new Date(), pollCount: rel.pollCount + 1 });
    return;
  }

  if (rel.status === "tearing_down") {
    // v1: one grace tick, then remove the environment row (cascades logs/vars).
    await appendReleaseLog(rel.id, "success", "Preview environment removed.");
    await db
      .update(releases)
      .set({ status: "completed", finishedAt: new Date(), lockedAt: null })
      .where(eq(releases.id, rel.id));
    // Keep the row (status=deleted) so releases/logs survive for auditing.
    await db
      .update(deployments)
      .set({ status: "deleted", lockedAt: null })
      .where(eq(deployments.id, env.id));
    return;
  }
}

// ── Build (v1: package-as-is) ────────────────────────────────────────────────

/**
 * Unpack the GitHub tarball and zip the function source. Looks for `lambda/`
 * first, falls back to root `index.mjs`. No dependency install, see the
 * contract note at the top of this file.
 */
async function packageLambdaBundle(releaseId: string, tarball: Buffer): Promise<Buffer> {
  const tar = await import("tar");
  const AdmZip = (await import("adm-zip")).default;
  const dir = mkdtempSync(join(tmpdir(), "diab-build-"));
  try {
    const tarPath = join(dir, "src.tgz");
    writeFileSync(tarPath, tarball);
    await tar.x({ file: tarPath, cwd: dir, strip: 1 }); // GitHub nests <repo>-<sha>/
    const zip = new AdmZip();
    const { existsSync } = await import("fs");
    if (existsSync(join(dir, "lambda"))) {
      zip.addLocalFolder(join(dir, "lambda"));
      await appendReleaseLog(releaseId, "info", "Packaged lambda/ directory.");
    } else if (existsSync(join(dir, "index.mjs"))) {
      zip.addLocalFile(join(dir, "index.mjs"));
      await appendReleaseLog(releaseId, "info", "Packaged root index.mjs.");
    } else {
      throw new Error(
        "No deployable source found: add a lambda/ directory (with index.mjs) or an index.mjs at the repo root."
      );
    }
    return zip.toBuffer();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
