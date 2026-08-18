import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { awsConnections } from "@/db/schema";
import { getOrgContext } from "@/lib/auth";
import { awsConnectionSchema } from "@/lib/validation";
import { newId } from "@/lib/id";
import { jsonError, zodErrorResponse } from "@/lib/api";

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return jsonError(401, "Sign in first.");

  const parsed = awsConnectionSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { awsAccountId, roleArn, defaultRegion } = parsed.data;

  const existing = await db.query.awsConnections.findFirst({
    where: eq(awsConnections.orgId, ctx.org.id),
  });
  if (existing) {
    await db
      .update(awsConnections)
      .set({ awsAccountId, roleArn, defaultRegion, lastValidatedAt: null })
      .where(eq(awsConnections.id, existing.id));
  } else {
    await db.insert(awsConnections).values({
      id: newId("aws"),
      orgId: ctx.org.id,
      awsAccountId,
      roleArn,
      defaultRegion,
    });
  }

  // The role is actually exercised (STS AssumeRole) at the start of every
  // provisioning run, that's the moment lastValidatedAt gets stamped.
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return jsonError(401, "Sign in first.");
  const connection = await db.query.awsConnections.findFirst({
    where: eq(awsConnections.orgId, ctx.org.id),
  });
  return NextResponse.json({ connection: connection ?? null });
}
