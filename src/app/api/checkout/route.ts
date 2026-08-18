import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getOrgContext } from "@/lib/auth";
import { getStripe, priceIdForPlan } from "@/lib/stripe";
import { jsonError } from "@/lib/api";
import type { PlanId } from "@/lib/plans";

const VALID_PLANS: PlanId[] = ["starter", "growth", "scale"];

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return jsonError(401, "Sign in first.");

  const body = (await req.json().catch(() => ({}))) as { plan?: string };
  const plan = body.plan as PlanId | undefined;
  if (!plan || !VALID_PLANS.includes(plan)) return jsonError(400, "Pick a valid plan.");

  const priceId = priceIdForPlan(plan);
  if (!priceId) {
    return jsonError(
      500,
      `Stripe price for the ${plan} plan isn't configured yet. Set STRIPE_PRICE_${plan.toUpperCase()} in the environment.`
    );
  }

  const stripe = getStripe();
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  // Reuse the Stripe customer if this org already has one.
  let customerId = ctx.org.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: ctx.user.email,
      name: ctx.org.name,
      metadata: { orgId: ctx.org.id },
    });
    customerId = customer.id;
    await db
      .update(organizations)
      .set({ stripeCustomerId: customerId })
      .where(eq(organizations.id, ctx.org.id));
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/dashboard?checkout=success`,
    cancel_url: `${appUrl}/pricing?checkout=canceled`,
    metadata: { orgId: ctx.org.id, plan },
    subscription_data: { metadata: { orgId: ctx.org.id, plan } },
  });

  return NextResponse.json({ url: session.url });
}
