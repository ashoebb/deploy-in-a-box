import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { deployments, envVars } from "@/db/schema";
import { getOrgContext } from "@/lib/auth";
import { envVarSchema } from "@/lib/validation";
import { seal } from "@/lib/crypto";
import { newId } from "@/lib/id";
import { jsonError, zodErrorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

async function ownedEnvironment(orgId: string, envId: string) {
  return db.query.deployments.findFirst({
    where: and(eq(deployments.id, envId), eq(deployments.orgId, orgId)),
  });
}

/** List vars, secret values are NEVER returned, only masked. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return jsonError(401, "Sign in first.");
  const env = await ownedEnvironment(ctx.org.id, params.id);
  if (!env) return jsonError(404, "Environment not found.");

  const rows = await db
    .select()
    .from(envVars)
    .where(eq(envVars.environmentId, env.id))
    .orderBy(asc(envVars.key));

  return NextResponse.json({
    envVars: rows.map((r) => ({
      id: r.id,
      key: r.key,
      isSecret: r.isSecret,
      valueMasked: "••••••••",
      updatedAt: r.updatedAt,
    })),
  });
}

/** Upsert a var. Values are sealed with AES-256-GCM before they touch the DB. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return jsonError(401, "Sign in first.");
  const env = await ownedEnvironment(ctx.org.id, params.id);
  if (!env) return jsonError(404, "Environment not found.");

  const parsed = envVarSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { key, value, isSecret } = parsed.data;

  const sealed = seal(value);
  const existing = await db.query.envVars.findFirst({
    where: and(eq(envVars.environmentId, env.id), eq(envVars.key, key)),
  });
  if (existing) {
    await db
      .update(envVars)
      .set({ valueEncrypted: sealed, isSecret, updatedByUserId: ctx.user.id, updatedAt: new Date() })
      .where(eq(envVars.id, existing.id));
  } else {
    await db.insert(envVars).values({
      id: newId("env"),
      environmentId: env.id,
      orgId: ctx.org.id,
      key,
      valueEncrypted: sealed,
      isSecret,
      updatedByUserId: ctx.user.id,
    });
  }
  return NextResponse.json({
    ok: true,
    note: "Applied on the next deploy, trigger one from the Releases card.",
  });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return jsonError(401, "Sign in first.");
  const env = await ownedEnvironment(ctx.org.id, params.id);
  if (!env) return jsonError(404, "Environment not found.");

  const { key } = (await req.json().catch(() => ({}))) as { key?: string };
  if (!key) return jsonError(400, "Provide the key to delete.");
  await db.delete(envVars).where(and(eq(envVars.environmentId, env.id), eq(envVars.key, key)));
  return NextResponse.json({ ok: true });
}
