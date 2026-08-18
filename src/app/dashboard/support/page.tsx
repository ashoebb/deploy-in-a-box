import type { Metadata } from "next";
import { getOrgContext } from "@/lib/auth";
import { Card, Kicker } from "@/components/ui";

export const metadata: Metadata = { title: "Support" };
export const dynamic = "force-dynamic";

const TIERS = [
  ["Starter", "Email support · two-business-day response target"],
  ["Growth", "Priority email · next-business-day response · onboarding architecture call"],
  ["Scale", "Dedicated channel · same-day response · quarterly infrastructure review"],
  ["Trial", "Email support, best effort, failed-run logs always get a look"],
] as const;

export default async function SupportPage() {
  const ctx = (await getOrgContext())!;
  const supportEmail = process.env.SUPPORT_EMAIL ?? "support@example.com";
  const subject = encodeURIComponent(`[${ctx.org.name}] Support request`);

  return (
    <div className="space-y-6">
      <div>
        <Kicker>Support</Kicker>
        <h1 className="display-wide font-display text-2xl font-bold text-ink">Get help</h1>
      </div>

      <Card title="Contact">
        <p className="text-sm leading-relaxed text-ink-soft">
          Email{" "}
          <a
            className="font-medium text-ink underline underline-offset-4"
            href={`mailto:${supportEmail}?subject=${subject}`}
          >
            {supportEmail}
          </a>{" "}
          from your account address. For provisioning problems, include the environment link
          from your dashboard, support can read the same run log you see, so there&apos;s
          nothing to copy-paste.
        </p>
      </Card>

      <Card title="Response targets by plan">
        <dl className="divide-y divide-line">
          {TIERS.map(([tier, desc]) => (
            <div key={tier} className="grid gap-1 py-2.5 sm:grid-cols-[120px_1fr]">
              <dt className="font-mono text-[12px] uppercase tracking-wide text-ink-faint">{tier}</dt>
              <dd className="text-sm text-ink-soft">{desc}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card title="Before you write in">
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-soft">
          <li>
            <strong>Failed run?</strong> The last red line in the log names the failing
            resource and AWS&apos;s reason. Nine times out of ten it&apos;s the connector role,
            re-deploy the latest connector-role.yaml and retry.
          </li>
          <li>
            <strong>Stack already exists?</strong> A previous stack with the same name is
            sitting in your CloudFormation console. Delete it there or pick a new project
            name.
          </li>
          <li>
            <strong>Deploy failed after a push?</strong> Open the release from the
            environment page. The log shows every step; the usual causes are a
            missing lambda/ directory in the repo or a webhook secret mismatch
            (re-copy it from the Git &amp; CI/CD page).
          </li>
          <li>
            <strong>Can&apos;t see logs or metrics?</strong> Your connector role may
            predate observability. Re-run the latest connector-role.yaml from the
            provision page; it takes about a minute and nothing else changes.
          </li>
          <li>
            <strong>Billing question?</strong> Invoices, payment methods, and
            cancellation all live in the Stripe customer portal on the Billing page.
            No email needed for those.
          </li>
          <li>
            <strong>Access questions?</strong> The FAQ&apos;s security section documents the
            exact role, scoping, and revocation path.
          </li>
        </ul>
      </Card>
    </div>
  );
}
