import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { deployments, awsConnections } from "@/db/schema";
import { appendLog } from "./log";
import {
  assumeCustomerRole,
  cfnClient,
  createCustomerStack,
  pollStack,
  friendlyAwsError,
} from "./aws";
import { runMockStep } from "./mock";

/**
 * Provisioning is an async job state machine:
 *
 *   queued ──▶ validating ──▶ provisioning ──▶ completed
 *                    │               │
 *                    └───────────────┴──────▶ failed
 *
 * Each call to processTick() advances every claimable job by exactly one step.
 * CloudFormation itself is asynchronous (CreateStack returns immediately, then
 * you poll), so a tick-based driver is a natural fit and works both ways:
 *
 *   - `npm run worker`, long-running loop, ticks every 15s (VM/ECS/Fly)
 *   - POST /api/jobs/tick, same function behind a CRON_SECRET, for
 *     Vercel Cron / EventBridge Scheduler when there's no resident process
 *
 * PROVISIONER_MODE=mock simulates a full run with realistic logs and fake
 * outputs, no AWS calls. mode=live performs the real assume-role +
 * CloudFormation deployment. Nothing else in the app changes between modes.
 */

const LOCK_STALE_MS = 3 * 60 * 1000; // steal locks older than 3 minutes
const MAX_POLLS = 120; // ~40min at 20s ticks, then time out
const CFN_TERMINAL_FAILURES = [
  "CREATE_FAILED",
  "ROLLBACK_COMPLETE",
  "ROLLBACK_FAILED",
  "ROLLBACK_IN_PROGRESS", // treated as failing; we keep polling until settled
];

export interface TickResult {
  claimed: number;
  advanced: string[];
}

export async function processTick(): Promise<TickResult> {
  const mode = process.env.PROVISIONER_MODE === "live" ? "live" : "mock";
  const staleBefore = new Date(Date.now() - LOCK_STALE_MS);

  // Claim: active jobs that are unlocked or whose lock has gone stale.
  const claimable = await db
    .update(deployments)
    .set({ lockedAt: new Date() })
    .where(
      and(
        inArray(deployments.status, ["queued", "validating", "provisioning"]),
        or(isNull(deployments.lockedAt), lt(deployments.lockedAt, staleBefore))
      )
    )
    .returning();

  const advanced: string[] = [];
  for (const dep of claimable) {
    try {
      if (mode === "mock") {
        await runMockStep(dep);
      } else {
        await runLiveStep(dep);
      }
      advanced.push(dep.id);
    } catch (err) {
      const friendly = friendlyAwsError(err);
      await appendLog(dep.id, "error", friendly, { raw: String(err) });
      await db
        .update(deployments)
        .set({
          status: "failed",
          errorMessage: friendly,
          finishedAt: new Date(),
          lockedAt: null,
        })
        .where(eq(deployments.id, dep.id));
    }
  }
  return { claimed: claimable.length, advanced };
}

type Deployment = typeof deployments.$inferSelect;

async function unlock(id: string, patch: Partial<typeof deployments.$inferInsert> = {}) {
  await db
    .update(deployments)
    .set({ ...patch, lockedAt: null })
    .where(eq(deployments.id, id));
}

async function runLiveStep(dep: Deployment) {
  if (dep.status === "queued") {
    // Step 1: assume the customer's role, this both validates their IAM
    // setup and yields the credentials for the deployment.
    await db
      .update(deployments)
      .set({ status: "validating", startedAt: new Date() })
      .where(eq(deployments.id, dep.id));
    await appendLog(dep.id, "info", "Run started. Validating AWS connection…");

    const conn = await db.query.awsConnections.findFirst({
      where: eq(awsConnections.orgId, dep.orgId),
    });
    if (!conn) throw new Error("No AWS connection on file for this account.");

    const externalId = String(dep.config.externalId ?? "");
    const creds = await assumeCustomerRole({
      roleArn: conn.roleArn,
      externalId,
      sessionName: `diab-${dep.projectName}-${dep.environment}`,
    });
    await appendLog(dep.id, "success", `Assumed role ${creds.assumedRoleArn}`, {
      accountId: conn.awsAccountId,
    });
    await db
      .update(awsConnections)
      .set({ lastValidatedAt: new Date() })
      .where(eq(awsConnections.id, conn.id));

    // Step 2: create the stack. CreateStack returns immediately; subsequent
    // ticks poll it.
    await appendLog(
      dep.id,
      "info",
      `Creating CloudFormation stack ${dep.stackName} in ${dep.region}…`
    );
    const cfn = cfnClient(dep.region, creds);
    const stackId = await createCustomerStack(cfn, {
      stackName: dep.stackName,
      projectName: dep.projectName,
      environment: dep.environment,
      enableUsageBilling: Boolean(dep.config.enableUsageBilling),
      cognitoCallbackUrl: String(dep.config.cognitoCallbackUrl ?? "http://localhost:3000/auth/callback"),
    });
    await appendLog(dep.id, "success", "Stack creation started", { stackId });
    await unlock(dep.id, { status: "provisioning", stackId, pollCount: 0 });
    return;
  }

  if (dep.status === "validating") {
    // A stale lock was stolen mid-validate; restart the step cleanly.
    await unlock(dep.id, { status: "queued" });
    return;
  }

  if (dep.status === "provisioning") {
    const conn = await db.query.awsConnections.findFirst({
      where: eq(awsConnections.orgId, dep.orgId),
    });
    if (!conn) throw new Error("AWS connection was removed mid-run.");

    const creds = await assumeCustomerRole({
      roleArn: conn.roleArn,
      externalId: String(dep.config.externalId ?? ""),
      sessionName: `diab-poll-${dep.projectName}`,
    });
    const cfn = cfnClient(dep.region, creds);

    let poll;
    try {
      poll = await pollStack(cfn, dep.stackName, dep.lastEventAt);
    } catch (err) {
      // Transient polling errors shouldn't kill the run, log and retry.
      await appendLog(dep.id, "warn", `Poll failed, will retry: ${String(err)}`);
      await unlock(dep.id, { pollCount: dep.pollCount + 1 });
      return;
    }

    let lastEventAt = dep.lastEventAt;
    for (const e of poll.newEvents) {
      const status = e.ResourceStatus ?? "";
      const level =
        status.includes("FAILED") ? "error" : status.endsWith("COMPLETE") ? "success" : "info";
      await appendLog(
        dep.id,
        level,
        `${e.ResourceType ?? ""} ${e.LogicalResourceId ?? ""}: ${status}` +
          (e.ResourceStatusReason ? `, ${e.ResourceStatusReason}` : "")
      );
      if (e.Timestamp) lastEventAt = e.Timestamp;
    }

    if (poll.status === "CREATE_COMPLETE") {
      await appendLog(dep.id, "success", "Stack created. Environment is live.");
      await unlock(dep.id, {
        status: "completed",
        outputs: poll.outputs,
        finishedAt: new Date(),
        lastEventAt,
      });
      return;
    }

    if (CFN_TERMINAL_FAILURES.includes(poll.status) && poll.status !== "ROLLBACK_IN_PROGRESS") {
      const reason =
        poll.statusReason ??
        "A resource failed to create. See the log above for the first failing resource.";
      throw new Error(`Stack ${poll.status}: ${reason}`);
    }

    if (dep.pollCount + 1 > MAX_POLLS) {
      throw new Error(
        "Provisioning timed out after 40 minutes. Check the CloudFormation console in your account; the stack may still complete or need manual deletion."
      );
    }

    await unlock(dep.id, { pollCount: dep.pollCount + 1, lastEventAt });
    return;
  }
}

/** Count of active runs, used by the UI and by the tick endpoint response. */
export async function activeRunCount(): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(deployments)
    .where(inArray(deployments.status, ["queued", "validating", "provisioning"]));
  return rows[0]?.n ?? 0;
}
