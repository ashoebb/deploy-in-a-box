import Link from "next/link";
import type { Metadata } from "next";
import { PLANS } from "@/lib/plans";
import { ButtonLink, Kicker, SectionTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Pricing" };

export default function PricingPage() {
  return (
    <section className="mx-auto max-w-wrap px-5 py-16 lg:py-20">
      <Kicker>Pricing</Kicker>
      <SectionTitle>Priced like the team you didn&apos;t have to hire</SectionTitle>
      <p className="mt-3 max-w-2xl text-ink-soft">
        Every plan includes automated provisioning into your own AWS account, the full
        infrastructure-as-code source, and updates for as long as you subscribe. AWS usage
        costs bill directly to your account, we never sit between you and your cloud.
      </p>

      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`relative flex flex-col rounded-[6px] border bg-white p-7 ${
              plan.highlighted ? "border-2 border-cargo shadow-[0_16px_40px_-20px_rgba(232,89,12,0.4)]" : "border-line"
            }`}
          >
            {plan.highlighted && (
              <span className="absolute -top-3 left-6 rounded-[3px] bg-cargo px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white">
                Most chosen
              </span>
            )}
            <h3 className="display-wide font-display text-2xl font-bold text-ink">{plan.name}</h3>
            <p className="mt-1 text-sm text-ink-faint">{plan.tagline}</p>
            <p className="mt-5">
              <span className="display-wide font-display text-4xl font-bold text-ink">
                ${plan.priceMonthly}
              </span>
              <span className="text-sm text-ink-faint"> / month</span>
            </p>
            <ul className="mt-6 flex-1 space-y-2.5">
              {plan.features.map((f) => (
                <li key={f} className="flex gap-2.5 text-sm leading-snug text-ink-soft">
                  <span aria-hidden className="mt-0.5 font-mono text-emerald-700">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <ButtonLink
              href={`/signup?plan=${plan.id}`}
              variant={plan.highlighted ? "primary" : "ink"}
              className="mt-7 w-full"
            >
              {plan.cta}
            </ButtonLink>
          </div>
        ))}
      </div>

      <div className="mt-10 rounded-[6px] border border-dashed border-cargo/60 bg-cargo-tint/40 px-6 py-5 sm:flex sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-cargo-dark">
            Limited free trial
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            A limited number of trial slots are open for teams that want to provision a real
            environment before subscribing. Slots are reviewed, not first-come-only.
          </p>
        </div>
        <ButtonLink href="/trial" variant="outline" className="mt-4 shrink-0 sm:mt-0">
          Apply for a trial slot
        </ButtonLink>
      </div>

      <div className="mt-14 grid gap-8 border-t border-line pt-10 md:grid-cols-3">
        <div>
          <h4 className="font-display text-base font-bold text-ink">What about AWS costs?</h4>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            The provisioned stack is serverless and pay-per-request: a fresh environment idles
            near $0–5/month and scales with real traffic. It bills on your AWS invoice, with
            every resource tagged so you can see exactly what it costs.
          </p>
        </div>
        <div>
          <h4 className="font-display text-base font-bold text-ink">Can I cancel?</h4>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Any time, from the billing page. Everything already provisioned lives in your AWS
            account as standard CloudFormation, it keeps running and stays yours. You lose
            the dashboard, updates, and new provisioning, not your infrastructure.
          </p>
        </div>
        <div>
          <h4 className="font-display text-base font-bold text-ink">Need something custom?</h4>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Agencies deploying more than ten client projects, or teams with VPC/compliance
            requirements, should <Link className="underline underline-offset-4" href="/dashboard/support">contact support</Link> for
            a scoped arrangement.
          </p>
        </div>
      </div>
    </section>
  );
}
