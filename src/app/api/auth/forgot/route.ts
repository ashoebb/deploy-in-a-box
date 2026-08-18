import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, passwordResetTokens } from "@/db/schema";
import { forgotSchema } from "@/lib/validation";
import { newId, newToken } from "@/lib/id";
import { sendMail } from "@/lib/mailer";
import { zodErrorResponse } from "@/lib/api";

export async function POST(req: Request) {
  const parsed = forgotSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const user = await db.query.users.findFirst({
    where: eq(users.email, parsed.data.email),
  });

  // Always return ok, never reveal whether an email exists.
  if (user) {
    const token = newToken();
    await db.insert(passwordResetTokens).values({
      id: newId("prt"),
      userId: user.id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const url = `${process.env.APP_URL ?? "http://localhost:3000"}/reset-password?token=${token}`;
    await sendMail({
      to: user.email,
      subject: "Reset your Deploy-in-a-Box password",
      text: `Hi ${user.name},\n\nUse this link to set a new password (valid for 1 hour):\n${url}\n\nIf you didn't request this, ignore this email, your password is unchanged.`,
    });
  }
  return NextResponse.json({ ok: true });
}
