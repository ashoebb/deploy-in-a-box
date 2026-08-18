import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  awsConnections,
  deployments,
  gitConnections,
  gitWebhookDeliveries,
  releases,
} from "@/db/schema";
import { verifyGitHubSignature } from "@/lib/git";
import { newId } from "@/lib/id";
import { appendLog } from "@/lib/provisioner/log";
import { appendReleaseLog } from "@/lib/provisioner/release";

export const dynamic = "force-dynamic";

/**
 * GitHub webhook, the CI/CD entry point. Mirrors the Stripe webhook's
 * contract: verify signature → idempotency insert → record work → fast 2xx.
 * All heavy lifting happens in the tick worker, never inline here.
 *
 * Configure on the repo (or via the GitHub App):
 *   URL:    {APP_URL}/api/git/webhook
 *   Secret: the per-connection webhook secret from the Git settings page
 *   Events: push, pull_request
 */
export async function POST(req: Request) {
  const payload = await req.text();
  const event = req.headers.get("x-github-event") ?? "";
  const delivery = req.headers.get("x-github-delivery") ?? "";
  const signature = req.headers.get("x-hub-signature-256");

  if (!event || !delivery) {
    return NextResponse.json({ error: "Missing GitHub event headers." }, { status: 400 });
  }

  let body: any;
  try {
    body = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const repoFullName: string | undefined = body?.repository?.full_name;
  if (!repoFullName) {
    return NextResponse.json({ error: "No repository in payload." }, { status: 400 });
  }

  // Match the connection FIRST, its secret is what we verify against.
  const conn = await db.query.gitConnections.findFirst({
    where: eq(gitConnections.repoFullName, repoFullName),
  });
  if (!conn) {
    // Unknown repo: acknowledge so GitHub doesn't retry forever, do nothing.
    return NextResponse.json({ ok: true, ignored: "repository not connected" });
  }

  if (!verifyGitHubSignature(payload, signature, conn.webhookSecret)) {
    return NextResponse.json({ error: "Signature verification failed." }, { status: 401 });
  }

  // Idempotency on the delivery guid, GitHub redelivers on timeouts.
  const inserted = await db
    .insert(gitWebhookDeliveries)
    .values({ id: delivery, event })
    .onConflictDoNothing()
    .returning({ id: gitWebhookDeliveries.id });
  if (inserted.length === 0) return NextResponse.json({ ok: true, duplicate: true });

  // Auto-capture the App installation id the first time we see it.
  if (body?.installation?.id && !conn.installationId) {
    await db
      .update(gitConnections)
      .set({ installationId: String(body.installation.id) })
      .where(eq(gitConnections.id, conn.id));
  }

  if (event === "ping") return NextResponse.json({ ok: true, pong: true });

  if (event === "push") {
    return handlePush(conn, body);
  }
  if (event === "pull_request") {
    return handlePullRequest(conn, body);
  }
  return NextResponse.json({ ok: true, ignored: event });
}

type GitConnection = typeof gitConnections.$inferSelect;

async function handlePush(conn: GitConnection, body: any) {
  const ref: string = body.ref ?? ""; // refs/heads/main
  const branch = ref.replace("refs/heads/", "");
  const sha: string = body.after ?? "";
  if (!sha || /^0+$/.test(sha)) {
    return NextResponse.json({ ok: true, ignored: "branch deletion" });
  }

  // Deploy to persistent, provisioned environments tracking this branch
  // (environments with no explicit branch track the connection's default).
  const envs = await db
    .select()
    .from(deployments)
    .where(
      and(
        eq(deployments.orgId, conn.orgId),
        eq(deployments.kind, "persistent"),
        eq(deployments.status, "completed")
      )
    );
  const targets = envs.filter((e) => (e.gitBranch ?? conn.defaultBranch) === branch);
  if (targets.length === 0) {
    return NextResponse.json({ ok: true, ignored: `no environments track ${branch}` });
  }

  const created: string[] = [];
  for (const env of targets) {
    const releaseId = newId("rel");
    await db.insert(releases).values({
      id: releaseId,
      environmentId: env.id,
      orgId: conn.orgId,
      gitSha: sha,
      gitRef: ref,
      commitMessage: String(body.head_commit?.message ?? "").split("\n")[0].slice(0, 200) || null,
      commitAuthor: body.head_commit?.author?.username ?? body.pusher?.name ?? null,
      trigger: "push",
      status: "queued",
    });
    await appendReleaseLog(
      releaseId,
      "info",
      `Queued by push to ${branch} (${sha.slice(0, 7)}) → ${env.stackName}.`
    );
    created.push(releaseId);
  }
  return NextResponse.json({ ok: true, releases: created });
}

async function handlePullRequest(conn: GitConnection, body: any) {
  const action: string = body.action ?? "";
  const pr = body.pull_request;
  if (!pr) return NextResponse.json({ ok: true, ignored: "no pull_request" });
  const prNumber: number = pr.number;
  const sha: string = pr.head?.sha ?? "";

  if (!conn.previewsEnabled) {
    return NextResponse.json({ ok: true, ignored: "previews disabled" });
  }

  // Base preview config on the org's newest completed persistent environment.
  const template = await db.query.deployments.findFirst({
    where: and(
      eq(deployments.orgId, conn.orgId),
      eq(deployments.kind, "persistent"),
      eq(deployments.status, "completed")
    ),
  });
  if (!template) {
    return NextResponse.json({ ok: true, ignored: "no completed environment to base previews on" });
  }

  const existingPreview = await db.query.deployments.findFirst({
    where: and(
      eq(deployments.orgId, conn.orgId),
      eq(deployments.kind, "preview"),
      eq(deployments.prNumber, prNumber),
      inArray(deployments.status, ["queued", "validating", "provisioning", "completed"])
    ),
  });

  if (action === "opened" || action === "reopened") {
    if (existingPreview) return NextResponse.json({ ok: true, ignored: "preview exists" });
    const awsConn = await db.query.awsConnections.findFirst({
      where: eq(awsConnections.orgId, conn.orgId),
    });
    if (!awsConn) return NextResponse.json({ ok: true, ignored: "no AWS connection" });

    // The EXISTING provisioning engine builds preview stacks, same pipeline,
    // ephemeral kind, pr-scoped stack name.
    const envId = newId("dep");
    const stackName = `diab-${template.projectName}-pr${prNumber}`;
    await db.insert(deployments).values({
      id: envId,
      orgId: conn.orgId,
      projectName: template.projectName,
      environment: `pr${prNumber}`,
      region: template.region,
      stackName,
      status: "queued",
      kind: "preview",
      prNumber,
      gitBranch: pr.head?.ref ?? null,
      currentSha: sha || null,
      config: {
        ...(template.config as Record<string, unknown>),
        awsAccountId: awsConn.awsAccountId,
        roleArn: awsConn.roleArn,
        previewOf: template.id,
      },
    });
    await appendLog(envId, "info", `Preview for PR #${prNumber} queued: ${stackName}.`);
    return NextResponse.json({ ok: true, preview: envId });
  }

  if (action === "synchronize") {
    if (!existingPreview || existingPreview.status !== "completed") {
      return NextResponse.json({ ok: true, ignored: "preview not ready for code updates" });
    }
    const releaseId = newId("rel");
    await db.insert(releases).values({
      id: releaseId,
      environmentId: existingPreview.id,
      orgId: conn.orgId,
      gitSha: sha,
      gitRef: `refs/pull/${prNumber}`,
      commitMessage: `PR #${prNumber} update`,
      commitAuthor: pr.user?.login ?? null,
      trigger: "pr_sync",
      status: "queued",
    });
    await appendReleaseLog(releaseId, "info", `Queued by PR #${prNumber} update (${sha.slice(0, 7)}).`);
    return NextResponse.json({ ok: true, release: releaseId });
  }

  if (action === "closed") {
    if (!existingPreview) return NextResponse.json({ ok: true, ignored: "no preview to tear down" });
    // Don't tear down an environment mid-provision; fail it instead.
    if (inArrayStatus(existingPreview.status, ["queued", "validating", "provisioning"])) {
      await db
        .update(deployments)
        .set({ status: "failed", errorMessage: "PR closed before provisioning finished.", lockedAt: null })
        .where(eq(deployments.id, existingPreview.id));
      return NextResponse.json({ ok: true, canceled: existingPreview.id });
    }
    const releaseId = newId("rel");
    await db.insert(releases).values({
      id: releaseId,
      environmentId: existingPreview.id,
      orgId: conn.orgId,
      gitSha: sha || existingPreview.currentSha || "HEAD",
      gitRef: `refs/pull/${prNumber}`,
      trigger: "pr_close",
      status: "queued",
    });
    await appendReleaseLog(releaseId, "info", `PR #${prNumber} closed, teardown queued.`);
    return NextResponse.json({ ok: true, teardown: releaseId });
  }

  return NextResponse.json({ ok: true, ignored: action });
}

function inArrayStatus(status: string, list: string[]) {
  return list.includes(status);
}
