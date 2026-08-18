import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { awsConnections } from "@/db/schema";
import { getOrgContext } from "@/lib/auth";
import { preflightConnection, friendlyAwsError } from "@/lib/provisioner/aws";
import { jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Fast, non-destructive check that the platform can assume the customer's
 * role and reach CloudFormation. In mock mode there's nothing to assume, so
 * it returns a clear "simulation" result instead of pretending.
 */
export async function POST() {
  const ctx = await getOrgContext();
  if (!ctx) return jsonError(401, "Sign in first.");

  const connection = await db.query.awsConnections.findFirst({
    where: eq(awsConnections.orgId, ctx.org.id),
  });
  if (!connection) return jsonError(400, "Connect your AWS account first.");

  const mode = process.env.PROVISIONER_MODE === "live" ? "live" : "mock";
  if (mode === "mock") {
    return NextResponse.json({
      ok: true,
      mode: "mock",
      message:
        "Simulation mode is on, so there's no live AWS call to test. Set PROVISIONER_MODE=live with platform credentials to run a real preflight.",
    });
  }

  try {
    const result = await preflightConnection({
      roleArn: connection.roleArn,
      externalId: ctx.org.externalId,
      region: connection.defaultRegion,
    });
    // Stamp the connection as validated so the dashboard can show it.
    await db
      .update(awsConnections)
      .set({ lastValidatedAt: new Date() })
      .where(eq(awsConnections.id, connection.id));
    return NextResponse.json({
      ok: true,
      mode: "live",
      message: `Assumed ${result.assumedRoleArn} and validated the template. You're ready to provision.`,
    });
  } catch (err) {
    // A failed assume-role is an expected *result* of this test, not an HTTP
    // error, return 200 so the UI shows the reason cleanly.
    return NextResponse.json({ ok: false, mode: "live", message: friendlyAwsError(err) });
  }
}
