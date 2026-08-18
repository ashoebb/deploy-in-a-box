import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getAdminSession } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { jsonError, zodErrorResponse } from "@/lib/api";

const schema = z.object({
  orgId: z.string().min(1),
  action: z.enum(["cancel_trial", "cancel_plan"]),
});

/**
 * Admin actions on an organization.
 * - cancel_trial: ends a trial immediately (plan back to none).
 * - cancel_plan: cancels the Stripe subscription at period end when Stripe is
 *   configured, and marks the org canceled locally either way.
 * Refunds intentionally stay in the Stripe dashboard, where disputes, partial
 * refunds, and the audit trail live. The billing page links there.
 */
export async function POST(req: Request) {
  const admin = await getAdminSession();
  if (!admin) return jsonError(403, "Admin only.");

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { orgId, action } = parsed.data;

  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, orgId) });
  if (!org) return jsonError(404, "Organization not found.");

  if (action === "cancel_trial") {
    if (org.plan !== "trial") return jsonError(409, "That organization isn't on a trial.");
    await db
      .update(organizations)
      .set({ plan: "none", subscriptionStatus: "inactive", trialEndsAt: null })
      .where(eq(organizations.id, orgId));
    return NextResponse.json({ ok: true, note: "Trial ended. Their provisioned infrastructure keeps running in their own AWS account." });
  }

  // cancel_plan
  if (org.plan === "none" || org.plan === "trial") {
    return jsonError(409, "That organization has no paid plan to cancel.");
  }
  let stripeNote = "No Stripe subscription on file; canceled locally.";
  if (org.stripeSubscriptionId && process.env.STRIPE_SECRET_KEY) {
    try {
      await getStripe().subscriptions.update(org.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
      stripeNote = "Stripe subscription set to cancel at period end.";
    } catch {
      stripeNote = "Stripe call failed; marked canceled locally. Check the Stripe dashboard.";
    }
  }
  await db
    .update(organizations)
    .set({ subscriptionStatus: "canceled" })
    .where(eq(organizations.id, orgId));
  return NextResponse.json({ ok: true, note: stripeNote });
}
