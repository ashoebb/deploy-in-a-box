import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, memberships, organizations } from "@/db/schema";

const COOKIE_NAME = "diab_session";
const SESSION_DAYS = 7;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
}

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export async function createSessionCookie(userId: string, orgId: string) {
  const jwt = await new SignJWT({ org: orgId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());

  cookies().set(COOKIE_NAME, jwt, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie() {
  cookies().set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
}

export interface Session {
  user: { id: string; email: string; name: string; platformRole: "user" | "admin" };
  orgId: string;
}

export async function getSession(): Promise<Session | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const userId = payload.sub;
    const orgId = payload.org as string | undefined;
    if (!userId || !orgId) return null;

    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) return null;
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        platformRole: user.platformRole,
      },
      orgId,
    };
  } catch {
    return null;
  }
}

/** For server components/pages: redirect to login when signed out. */
export async function requireSession(nextPath?: string): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(`/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`);
  return session;
}

export async function requireAdmin(): Promise<Session> {
  const session = await requireSession("/admin");
  if (session.user.platformRole !== "admin") redirect("/dashboard");
  return session;
}

export async function getOrgForSession(session: Session) {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, session.orgId),
  });
  if (!org) throw new Error("Organization not found for session");
  return org;
}

export async function primaryOrgIdForUser(userId: string): Promise<string | null> {
  const m = await db.query.memberships.findFirst({
    where: eq(memberships.userId, userId),
  });
  return m?.orgId ?? null;
}

/**
 * Session + organization row in one call, without redirecting.
 * API routes and pages that want to handle "signed out" themselves use this.
 */
export async function getOrgContext() {
  const session = await getSession();
  if (!session) return null;
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, session.orgId),
  });
  if (!org) return null;
  return { user: session.user, org };
}

/** Admin session or null, for JSON APIs that should 403 rather than redirect. */
export async function getAdminSession(): Promise<Session | null> {
  const session = await getSession();
  return session && session.user.platformRole === "admin" ? session : null;
}
