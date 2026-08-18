import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, webhookEvents } from "@/db/schema";
import { getStripe } from "@/lib/stripe";
import type { PlanId } from "@/lib/plans";

export const dynamic = "force-dynamic";

/**
 * Stripe webhook, the single source of truth for subscription state.
 *
 * Local dev:   stripe listen --forward-to localhost:3000/api/stripe/webhook
 * Production:  add the endpoint in the Stripe dashboard and set STRIPE_WEBHOOK_SECRET.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not configured." },
      { status: 500 }
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature." }, { status: 400 });

  const payload = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch {
    return NextResponse.json({ error: "Signature verification failed." }, { status: 400 });
  }

  // Idempotency: insert the event id; if it's already there, we've processed it.
  const inserted = await db
    .insert(webhookEvents)
    .values({ id: event.id, type: event.type })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  if (inserted.length === 0) return NextResponse.json({ ok: true, duplicate: true });

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId = session.metadata?.orgId;
      const plan = session.metadata?.plan as PlanId | undefined;
      if (orgId && plan) {
        await db
          .update(organizations)
          .set({
            plan,
            subscriptionStatus: "active",
            stripeSubscriptionId:
              typeof session.subscription === "string"
                ? session.subscription
                : session.subscription?.id ?? null,
          })
          .where(eq(organizations.id, orgId));
      }
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const orgId = sub.metadata?.orgId;
      if (orgId) {
        const status =
          sub.status === "active" || sub.status === "trialing"
            ? "active"
            : sub.status === "past_due" || sub.status === "unpaid"
              ? "past_due"
              : sub.status === "canceled"
                ? "canceled"
                : "inactive";
        await db
          .update(organizations)
          .set({ subscriptionStatus: status })
          .where(eq(organizations.id, orgId));
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const orgId = sub.metadata?.orgId;
      if (orgId) {
        await db
          .update(organizations)
          .set({ subscriptionStatus: "canceled", plan: "none" })
          .where(eq(organizations.id, orgId));
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId =
        typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (customerId) {
        await db
          .update(organizations)
          .set({ subscriptionStatus: "past_due" })
          .where(eq(organizations.stripeCustomerId, customerId));
      }
      break;
    }

    default:
      // Unhandled event types are acknowledged so Stripe stops retrying.
      break;
  }

  return NextResponse.json({ ok: true });
}
