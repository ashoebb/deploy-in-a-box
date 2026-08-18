import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { awsConnections, deployments } from "@/db/schema";
import { getOrgContext } from "@/lib/auth";
import { provisionSchema } from "@/lib/validation";
import { newId } from "@/lib/id";
import { appendLog } from "@/lib/provisioner/log";
import { maxEnvironmentsForPlan } from "@/lib/plans";
import { jsonError, zodErrorResponse } from "@/lib/api";

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return jsonError(401, "Sign in first.");

  // ── Gate 1: subscription or approved trial ─────────────────────────────
  const orgActive =
    ctx.org.subscriptionStatus === "active" || ctx.org.subscriptionStatus === "trialing";
  if (!orgActive) {
    return jsonError(402, "Provisioning unlocks once a plan (or approved trial) is active.");
  }
  if (
    ctx.org.plan === "trial" &&
    ctx.org.trialEndsAt &&
    ctx.org.trialEndsAt.getTime() < Date.now()
  ) {
    return jsonError(402, "Your trial window has ended. Pick a plan to keep provisioning.");
  }

  // ── Gate 2: AWS connection on file ─────────────────────────────────────
  const connection = await db.query.awsConnections.findFirst({
    where: eq(awsConnections.orgId, ctx.org.id),
  });
  if (!connection) {
    return jsonError(400, "Connect your AWS account first, the provisioner needs a role to assume.");
  }

  // ── Gate 3: validated input ────────────────────────────────────────────
  const parsed = provisionSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const cfg = parsed.data;

  // ── Gate 4: plan environment limit ─────────────────────────────────────
  const existing = await db
    .select({ id: deployments.id, projectName: deployments.projectName, environment: deployments.environment, status: deployments.status })
    .from(deployments)
    .where(
      and(
        eq(deployments.orgId, ctx.org.id),
        inArray(deployments.status, ["queued", "validating", "provisioning", "completed"])
      )
    );
  const limit = maxEnvironmentsForPlan(ctx.org.plan);
  if (existing.length >= limit) {
    return jsonError(
      403,
      `Your plan allows ${limit} environment${limit === 1 ? "" : "s"} and you already have ${existing.length}. Upgrade to provision more.`
    );
  }

  // ── Gate 5: no duplicate project+environment ───────────────────────────
  const stackName = `diab-${cfg.projectName}-${cfg.environment}`;
  const dupe = existing.find(
    (d) => d.projectName === cfg.projectName && d.environment === cfg.environment
  );
  if (dupe) {
    return jsonError(409, `${stackName} already exists for this organization. Pick a different project name or environment.`);
  }

  // ── Enqueue ────────────────────────────────────────────────────────────
  const deploymentId = newId("dep");
  await db.insert(deployments).values({
    id: deploymentId,
    orgId: ctx.org.id,
    projectName: cfg.projectName,
    environment: cfg.environment,
    region: cfg.region,
    stackName,
    status: "queued",
    config: {
      ...cfg,
      // Snapshot the connection so a later connection edit can't affect an in-flight run.
      awsAccountId: connection.awsAccountId,
      roleArn: connection.roleArn,
      externalId: ctx.org.externalId,
      requestedBy: ctx.user.id,
    },
  });
  await appendLog(
    deploymentId,
    "info",
    `Run queued: ${stackName} in ${cfg.region} (account ${connection.awsAccountId}).`
  );

  return NextResponse.json({ ok: true, deploymentId });
}
