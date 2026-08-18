import type { Metadata } from "next";
import Link from "next/link";
import { getOrgContext } from "@/lib/auth";
import { PLANS } from "@/lib/plans";
import { Card, Kicker } from "@/components/ui";
import PortalButton from "./PortalButton";

export const metadata: Metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const ctx = (await getOrgContext())!;
  const { org } = ctx;
  const planDef = PLANS.find((p) => p.id === org.plan);

  return (
    <div className="space-y-6">
      <div>
        <Kicker>Billing</Kicker>
        <h1 className="display-wide font-display text-2xl font-bold text-ink">Plan & payments</h1>
      </div>

      <Card title="Current plan">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="display-wide font-display text-2xl font-bold text-ink">
              {org.plan === "none"
                ? "No plan"
                : org.plan === "trial"
                  ? "Free trial"
                  : planDef?.name ?? org.plan}
            </p>
            <p className="mt-1 text-sm text-ink-faint">
              status: {org.subscriptionStatus}
              {org.plan === "trial" && org.trialEndsAt
                ? ` · trial ends ${org.trialEndsAt.toISOString().slice(0, 10)}`
                : planDef
                  ? ` · $${planDef.priceMonthly}/month`
                  : ""}
            </p>
          </div>
          {org.stripeCustomerId ? (
            <PortalButton />
          ) : (
            <Link
              href="/pricing"
              className="rounded-[4px] bg-cargo px-5 py-2.5 text-sm font-semibold text-white hover:bg-cargo-dark"
            >
              Choose a plan
            </Link>
          )}
        </div>
      </Card>

      <Card title="How billing works">
        <ul className="space-y-2.5 text-sm leading-relaxed text-ink-soft">
          <li>
            Subscriptions are handled by Stripe. The customer portal (button above) covers
            invoices, payment methods, plan changes, and cancellation, changes sync back
            here automatically via webhook.
          </li>
          <li>
            AWS usage for provisioned environments bills directly to your AWS account. We
            never proxy or mark up cloud costs.
          </li>
          <li>
            If a payment fails, your account moves to <em>past due</em>: existing
            environments keep running (they&apos;re in your account), new provisioning pauses
            until payment succeeds.
          </li>
        </ul>
      </Card>
    </div>
  );
}
