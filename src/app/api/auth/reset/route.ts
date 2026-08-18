import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { users, passwordResetTokens } from "@/db/schema";
import { resetSchema } from "@/lib/validation";
import { hashPassword } from "@/lib/auth";
import { jsonError, zodErrorResponse } from "@/lib/api";

export async function POST(req: Request) {
  const parsed = resetSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { token, password } = parsed.data;

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const row = await db.query.passwordResetTokens.findFirst({
    where: and(
      eq(passwordResetTokens.tokenHash, tokenHash),
      gt(passwordResetTokens.expiresAt, new Date()),
      isNull(passwordResetTokens.usedAt)
    ),
  });
  if (!row) return jsonError(400, "This reset link is invalid or has expired. Request a new one.");

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password) })
    .where(eq(users.id, row.userId));
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, row.id));

  return NextResponse.json({ ok: true });
}
