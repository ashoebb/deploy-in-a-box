import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, organizations, memberships } from "@/db/schema";
import { signupSchema } from "@/lib/validation";
import { hashPassword, createSessionCookie } from "@/lib/auth";
import { newId, newExternalId } from "@/lib/id";
import { jsonError, zodErrorResponse } from "@/lib/api";

export async function POST(req: Request) {
  const parsed = signupSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { name, businessName, email, password } = parsed.data;

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) return jsonError(409, "An account with this email already exists. Sign in instead.");

  const userId = newId("usr");
  const orgId = newId("org");
  await db.insert(users).values({
    id: userId,
    email,
    passwordHash: await hashPassword(password),
    name,
  });
  await db.insert(organizations).values({
    id: orgId,
    name: businessName,
    externalId: newExternalId(),
  });
  await db.insert(memberships).values({ id: newId("mem"), userId, orgId, role: "owner" });

  await createSessionCookie(userId, orgId);
  return NextResponse.json({ ok: true });
}
