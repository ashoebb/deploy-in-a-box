import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { deployments, gitConnections, releases } from "@/db/schema";
import { getOrgContext } from "@/lib/auth";
import { manualDeploySchema } from "@/lib/validation";
import { newId } from "@/lib/id";
import { appendReleaseLog } from "@/lib/provisioner/release";
import { jsonError, zodErrorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Manual deploy, used for "Redeploy" (env var changes) and first-time setup tests. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return jsonError(401, "Sign in first.");

  const env = await db.query.deployments.findFirst({
    where: and(eq(deployments.id, params.id), eq(deployments.orgId, ctx.org.id)),
  });
  if (!env) return jsonError(404, "Environment not found.");
  if (env.status !== "completed") {
    return jsonError(409, "This environment isn't provisioned yet, deploys need a live stack.");
  }

  const conn = await db.query.gitConnections.findFirst({
    where: eq(gitConnections.orgId, ctx.org.id),
  });
  if (!conn) {
    return jsonError(400, "Connect a repository first (Dashboard → Git & CI/CD).");
  }

  const active = await db.query.releases.findFirst({
    where: and(
      eq(releases.environmentId, env.id),
      inArray(releases.status, ["queued", "building", "deploying", "tearing_down"])
    ),
  });
  if (active) return jsonError(409, "A release is already in flight for this environment.");

  const parsed = manualDeploySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const last = await db.query.releases.findFirst({
    where: eq(releases.environmentId, env.id),
    orderBy: desc(releases.createdAt),
  });
  const sha =
    parsed.data.gitSha ??
    env.currentSha ??
    last?.gitSha ??
    // Mock mode bootstraps with a deterministic fake sha.
    "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";

  const releaseId = newId("rel");
  await db.insert(releases).values({
    id: releaseId,
    environmentId: env.id,
    orgId: ctx.org.id,
    gitSha: sha,
    gitRef: `refs/heads/${env.gitBranch ?? conn.defaultBranch}`,
    commitMessage: "Manual deploy from dashboard",
    commitAuthor: ctx.user.name,
    trigger: "manual",
    status: "queued",
  });
  await appendReleaseLog(releaseId, "info", `Manual deploy queued by ${ctx.user.name}.`);
  return NextResponse.json({ ok: true, releaseId });
}
