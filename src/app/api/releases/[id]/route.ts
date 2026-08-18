import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { releaseLogs, releases } from "@/db/schema";
import { getOrgContext } from "@/lib/auth";
import { jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return jsonError(401, "Sign in first.");

  const release = await db.query.releases.findFirst({
    where: and(eq(releases.id, params.id), eq(releases.orgId, ctx.org.id)),
  });
  if (!release) return jsonError(404, "Release not found.");

  const logs = await db
    .select()
    .from(releaseLogs)
    .where(eq(releaseLogs.releaseId, release.id))
    .orderBy(asc(releaseLogs.ts), asc(releaseLogs.id));

  return NextResponse.json({
    release: {
      id: release.id,
      environmentId: release.environmentId,
      gitSha: release.gitSha,
      gitRef: release.gitRef,
      commitMessage: release.commitMessage,
      commitAuthor: release.commitAuthor,
      trigger: release.trigger,
      status: release.status,
      errorMessage: release.errorMessage,
      createdAt: release.createdAt,
      finishedAt: release.finishedAt,
    },
    logs: logs.map((l) => ({ id: l.id, level: l.level, message: l.message, createdAt: l.ts })),
  });
}
