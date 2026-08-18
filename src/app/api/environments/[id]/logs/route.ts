import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { deployments } from "@/db/schema";
import { getOrgContext } from "@/lib/auth";
import { assumeCustomerRole, friendlyAwsError } from "@/lib/provisioner/aws";
import { fetchLiveLogs, mockLogs } from "@/lib/provisioner/observability";
import { jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

const MAX_RANGE_MS = 24 * 60 * 60 * 1000;

/**
 * Function logs, fetched on demand from the customer's CloudWatch, never
 * stored in the control plane. ?start=&end= (ms epoch), ?q= filter, ?token=
 * for pagination.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return jsonError(401, "Sign in first.");

  const env = await db.query.deployments.findFirst({
    where: and(eq(deployments.id, params.id), eq(deployments.orgId, ctx.org.id)),
  });
  if (!env) return jsonError(404, "Environment not found.");
  if (env.status !== "completed") {
    return jsonError(409, "Logs are available once the environment is provisioned.");
  }

  const url = new URL(req.url);
  const now = Date.now();
  const end = clampInt(url.searchParams.get("end"), now);
  let start = clampInt(url.searchParams.get("start"), now - 60 * 60 * 1000);
  if (end - start > MAX_RANGE_MS) start = end - MAX_RANGE_MS;
  const filter = url.searchParams.get("q") ?? undefined;
  const token = url.searchParams.get("token") ?? undefined;

  const mode = process.env.PROVISIONER_MODE === "live" ? "live" : "mock";
  if (mode === "mock") {
    return NextResponse.json({
      mode,
      ...mockLogs({ envId: env.id, stackName: env.stackName, startMs: start, endMs: end, filter }),
    });
  }

  try {
    const creds = await assumeCustomerRole({
      roleArn: String(env.config.roleArn ?? ""),
      externalId: String(env.config.externalId ?? ""),
      sessionName: "diab-logs",
    });
    const page = await fetchLiveLogs({
      region: env.region,
      creds,
      stackName: env.stackName,
      startMs: start,
      endMs: end,
      filter,
      nextToken: token,
    });
    return NextResponse.json({ mode, ...page });
  } catch (err) {
    return jsonError(502, friendlyAwsError(err));
  }
}

function clampInt(v: string | null, fallback: number): number {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
