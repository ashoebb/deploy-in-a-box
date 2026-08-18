import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { loginSchema } from "@/lib/validation";
import { verifyPassword, createSessionCookie, primaryOrgIdForUser } from "@/lib/auth";
import { jsonError, zodErrorResponse } from "@/lib/api";

export async function POST(req: Request) {
  const parsed = loginSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { email, password } = parsed.data;

  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return jsonError(401, "Email or password is incorrect.");
  }
  const orgId = await primaryOrgIdForUser(user.id);
  if (!orgId) return jsonError(500, "This account has no organization. Contact support.");

  await createSessionCookie(user.id, orgId);
  return NextResponse.json({ ok: true, isAdmin: user.platformRole === "admin" });
}
