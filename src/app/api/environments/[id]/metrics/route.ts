import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { deployments } from "@/db/schema";
import { getOrgContext } from "@/lib/auth";
import { assumeCustomerRole, friendlyAwsError } from "@/lib/provisioner/aws";
import { fetchLiveMetrics, mockMetrics } from "@/lib/provisioner/observability";
import { jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

const RANGES: Record<string, { ms: number; periodSec: number }> = {
  "1h": { ms: 60 * 60 * 1000, periodSec: 60 },
  "6h": { ms: 6 * 60 * 60 * 1000, periodSec: 300 },
  "24h": { ms: 24 * 60 * 60 * 1000, periodSec: 900 },
  "7d": { ms: 7 * 24 * 60 * 60 * 1000, periodSec: 3600 },
};

/** Lambda + DynamoDB metrics via GetMetricData. ?range=1h|6h|24h|7d */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return jsonError(401, "Sign in first.");

  const env = await db.query.deployments.findFirst({
    where: and(eq(deployments.id, params.id), eq(deployments.orgId, ctx.org.id)),
  });
  if (!env) return jsonError(404, "Environment not found.");
  if (env.status !== "completed") {
    return jsonError(409, "Metrics are available once the environment is provisioned.");
  }

  const url = new URL(req.url);
  const range = RANGES[url.searchParams.get("range") ?? "1h"] ?? RANGES["1h"];
  const end = Date.now();
  const start = end - range.ms;

  const mode = process.env.PROVISIONER_MODE === "live" ? "live" : "mock";
  if (mode === "mock") {
    return NextResponse.json({
      mode,
      series: mockMetrics({ envId: env.id, startMs: start, endMs: end, periodSec: range.periodSec }),
    });
  }

  try {
    const creds = await assumeCustomerRole({
      roleArn: String(env.config.roleArn ?? ""),
      externalId: String(env.config.externalId ?? ""),
      sessionName: "diab-metrics",
    });
    const outputs = (env.outputs ?? {}) as Record<string, string>;
    const series = await fetchLiveMetrics({
      region: env.region,
      creds,
      stackName: env.stackName,
      dataTableName: outputs.DataTableName ?? `${env.stackName}-data`,
      startMs: start,
      endMs: end,
      periodSec: range.periodSec,
    });
    return NextResponse.json({ mode, series });
  } catch (err) {
    return jsonError(502, friendlyAwsError(err));
  }
}
