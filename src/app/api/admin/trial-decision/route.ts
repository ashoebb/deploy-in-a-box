import { NextResponse } from "next/server";
import { z } from "zod";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  memberships,
  organizations,
  trialApplications,
  trialSettings,
  users,
} from "@/db/schema";
import { getAdminSession } from "@/lib/auth";
import { sendMail } from "@/lib/mailer";
import { jsonError, zodErrorResponse } from "@/lib/api";

const schema = z.object({
  applicationId: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
  decisionNote: z.string().max(500).optional().default(""),
});

export async function POST(req: Request) {
  const admin = await getAdminSession();
  if (!admin) return jsonError(403, "Admin only.");

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { applicationId, decision, decisionNote } = parsed.data;

  const app = await db.query.trialApplications.findFirst({
    where: eq(trialApplications.id, applicationId),
  });
  if (!app) return jsonError(404, "Application not found.");
  if (app.status !== "pending") return jsonError(409, "Already decided.");

  const settings = await db.query.trialSettings.findFirst({
    where: eq(trialSettings.id, "default"),
  });
  if (!settings) return jsonError(503, "Trial settings missing.");

  if (decision === "approved") {
    const trialEnd = new Date(Date.now() + settings.trialLengthDays * 24 * 60 * 60 * 1000);
    const effectiveEnd =
      settings.cutoffDate && settings.cutoffDate.getTime() < trialEnd.getTime()
        ? settings.cutoffDate
        : trialEnd;

    await db
      .update(trialSettings)
      .set({ slotsUsed: sql`${trialSettings.slotsUsed} + 1` })
      .where(eq(trialSettings.id, "default"));
    await db
      .update(organizations)
      .set({ plan: "trial", subscriptionStatus: "trialing", trialEndsAt: effectiveEnd })
      .where(eq(organizations.id, app.orgId));
  }

  await db
    .update(trialApplications)
    .set({
      status: decision,
      decisionNote: decisionNote || null,
      decidedAt: new Date(),
      decidedBy: admin.user.id,
    })
    .where(eq(trialApplications.id, applicationId));

  // Notify the organization's first member (its owner from signup).
  const member = await db
    .select({ email: users.email, name: users.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.orgId, app.orgId))
    .orderBy(asc(memberships.createdAt))
    .limit(1);

  if (member[0]) {
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    await sendMail({
      to: member[0].email,
      subject:
        decision === "approved"
          ? "Your Deploy-in-a-Box trial is approved"
          : "About your Deploy-in-a-Box trial application",
      text:
        decision === "approved"
          ? `Hi ${member[0].name},\n\nYour trial slot is approved, provisioning is unlocked for one environment.\n\nStart here: ${appUrl}/dashboard/provision\n\n, Deploy-in-a-Box`
          : `Hi ${member[0].name},\n\nWe couldn't approve a trial slot this window.${decisionNote ? `\n\nNote from the review: ${decisionNote}` : ""}\n\nYou can start on a paid plan any time: ${appUrl}/pricing\n\n, Deploy-in-a-Box`,
    });
  }

  return NextResponse.json({ ok: true });
}
