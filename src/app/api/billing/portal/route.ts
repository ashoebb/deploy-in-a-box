import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { jsonError } from "@/lib/api";

export async function POST() {
  const ctx = await getOrgContext();
  if (!ctx) return jsonError(401, "Sign in first.");
  if (!ctx.org.stripeCustomerId) {
    return jsonError(400, "No billing profile yet, subscribe to a plan first.");
  }

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: ctx.org.stripeCustomerId,
    return_url: `${process.env.APP_URL ?? "http://localhost:3000"}/dashboard/billing`,
  });
  return NextResponse.json({ url: session.url });
}
