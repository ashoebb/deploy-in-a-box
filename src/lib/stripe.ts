import Stripe from "stripe";
import type { PlanId } from "./plans";

let _stripe: Stripe | null = null;

/** Lazy singleton so the app builds without a key and fails only when used. */
export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  _stripe = new Stripe(key, { apiVersion: "2025-02-24.acacia" as Stripe.LatestApiVersion });
  return _stripe;
}

export function priceIdForPlan(plan: PlanId): string {
  const envName =
    plan === "starter"
      ? "STRIPE_PRICE_STARTER"
      : plan === "growth"
        ? "STRIPE_PRICE_GROWTH"
        : plan === "scale"
          ? "STRIPE_PRICE_SCALE"
          : null;
  if (!envName) throw new Error(`No Stripe price for plan "${plan}"`);
  const id = process.env[envName];
  if (!id) throw new Error(`${envName} is not set`);
  return id;
}

/**
 * Usage-based billing hook, integration point.
 * The customer's deployed stack (Growth plan and up) writes metered events to
 * its UsageEvents table; a collector you run (or a scheduled export) calls this
 * to push quantities to a Stripe metered price. Wire the meter/price ID before
 * enabling usage-based plans.
 */
export async function reportUsage(opts: {
  stripeCustomerId: string;
  meterEventName: string;
  value: number;
}): Promise<void> {
  const stripe = getStripe();
  await stripe.billing.meterEvents.create({
    event_name: opts.meterEventName,
    payload: {
      stripe_customer_id: opts.stripeCustomerId,
      value: String(opts.value),
    },
  });
}
