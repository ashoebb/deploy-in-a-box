import { NextResponse } from "next/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { deploymentLogs, deployments, releases } from "@/db/schema";
import { getOrgContext } from "@/lib/auth";
import { jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return jsonError(401, "Sign in first.");

  const deployment = await db.query.deployments.findFirst({
    where: and(eq(deployments.id, params.id), eq(deployments.orgId, ctx.org.id)),
  });
  if (!deployment) return jsonError(404, "Deployment not found.");

  const recentReleases = await db
    .select()
    .from(releases)
    .where(eq(releases.environmentId, deployment.id))
    .orderBy(desc(releases.createdAt))
    .limit(20);

  const logs = await db
    .select()
    .from(deploymentLogs)
    .where(eq(deploymentLogs.deploymentId, deployment.id))
    .orderBy(asc(deploymentLogs.ts), asc(deploymentLogs.id));

  return NextResponse.json({
    deployment: {
      id: deployment.id,
      projectName: deployment.projectName,
      environment: deployment.environment,
      region: deployment.region,
      stackName: deployment.stackName,
      status: deployment.status,
      kind: deployment.kind,
      currentSha: deployment.currentSha,
      gitBranch: deployment.gitBranch,
      errorMessage: deployment.errorMessage,
      outputs: deployment.outputs,
      createdAt: deployment.createdAt,
      updatedAt:
        deployment.finishedAt ?? deployment.startedAt ?? deployment.createdAt,
    },
    releases: recentReleases.map((r) => ({
      id: r.id,
      gitSha: r.gitSha,
      trigger: r.trigger,
      status: r.status,
      commitMessage: r.commitMessage,
      commitAuthor: r.commitAuthor,
      createdAt: r.createdAt,
    })),
    logs: logs.map((l) => ({
      id: l.id,
      level: l.level,
      message: l.message,
      createdAt: l.ts,
    })),
  });
}
