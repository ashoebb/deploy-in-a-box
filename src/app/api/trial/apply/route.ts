import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { organizations, trialApplications, trialSettings } from "@/db/schema";
import { getOrgContext } from "@/lib/auth";
import { trialApplicationSchema } from "@/lib/validation";
import { newId } from "@/lib/id";
import { jsonError, zodErrorResponse } from "@/lib/api";

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return jsonError(401, "Sign in first.");

  const parsed = trialApplicationSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return zodErrorResponse(parsed.error);

  if (ctx.org.plan !== "none") {
    return jsonError(400, "This organization already has a plan, the trial is for new accounts.");
  }
  const existing = await db.query.trialApplications.findFirst({
    where: eq(trialApplications.orgId, ctx.org.id),
  });
  if (existing) {
    return jsonError(409, "You've already applied. Check your dashboard for the decision.");
  }

  const settings = await db.query.trialSettings.findFirst({
    where: eq(trialSettings.id, "default"),
  });
  if (!settings) {
    return jsonError(503, "The trial program isn't configured yet. Try again later.");
  }

  const now = Date.now();
  const windowOpen =
    settings.slotsUsed < settings.slotsTotal &&
    (!settings.cutoffDate || settings.cutoffDate.getTime() > now);

  const applicationId = newId("app");
  const base = {
    id: applicationId,
    orgId: ctx.org.id,
    ...parsed.data,
    website: parsed.data.website || null,
  };

  // Auto-approve while slots remain and the window is open (v1 behavior).
  if (windowOpen && settings.autoApprove) {
    // Claim a slot atomically, guards against two applicants racing for the last slot.
    const claimed = await db
      .update(trialSettings)
      .set({ slotsUsed: sql`${trialSettings.slotsUsed} + 1` })
      .where(
        sql`${trialSettings.id} = 'default' AND ${trialSettings.slotsUsed} < ${trialSettings.slotsTotal}`
      )
      .returning({ slotsUsed: trialSettings.slotsUsed });

    if (claimed.length > 0) {
      const trialEnd = new Date(now + settings.trialLengthDays * 24 * 60 * 60 * 1000);
      const effectiveEnd =
        settings.cutoffDate && settings.cutoffDate.getTime() < trialEnd.getTime()
          ? settings.cutoffDate
          : trialEnd;

      await db.insert(trialApplications).values({ ...base, status: "approved" });
      await db
        .update(organizations)
        .set({ plan: "trial", subscriptionStatus: "trialing", trialEndsAt: effectiveEnd })
        .where(eq(organizations.id, ctx.org.id));

      return NextResponse.json({ ok: true, status: "approved", trialEndsAt: effectiveEnd });
    }
  }

  // Otherwise queue for admin review.
  await db.insert(trialApplications).values({ ...base, status: "pending" });
  return NextResponse.json({ ok: true, status: "pending" });
}
