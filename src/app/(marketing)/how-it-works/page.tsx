import type { Metadata } from "next";
import { ButtonLink, Kicker, SectionTitle } from "@/components/ui";

export const metadata: Metadata = { title: "How it works" };

const STAGES = [
  {
    k: "01",
    title: "Sign up and choose a plan",
    body: "Create a business account with your work email and pick Starter, Growth, or Scale. Payment runs through Stripe; the moment your subscription is active, provisioning unlocks. Trial applicants follow the same path with a reviewed slot instead of a card.",
    aside: "~2 minutes",
  },
  {
    k: "02",
    title: "Connect your AWS account",
    body: "You never hand us keys. Your dashboard gives you a one-page CloudFormation template, the connector role, plus your unique External ID. Launch it in your AWS account (console or CLI); it creates a single IAM role that only our platform account can assume, only with your External ID, and only for resources named diab-*. Paste the role ARN back into the dashboard and you're connected. Deleting that role at any time cuts our access completely.",
    aside: "~5 minutes, one-time",
  },
  {
    k: "03",
    title: "Configure your environment",
    body: "Name the project, pick staging or production, choose a region, and set your module toggles: subscription vs. usage-based billing, which auth providers to enable, and your app's callback URL. Everything is validated before anything can run, account IDs, ARNs, naming, all of it.",
    aside: "~3 minutes",
  },
  {
    k: "04",
    title: "Automated provisioning",
    body: "This is the part you don't do. The platform assumes your connector role, launches the CloudFormation stack, and streams every resource event into your dashboard live: tables, user pool, functions, API, CDN. If a step fails, say the role is missing a permission, CloudFormation rolls the stack back cleanly, the run is marked failed, and the log tells you exactly which resource and why. Fix, then re-run.",
    aside: "typically 10–20 minutes",
  },
  {
    k: "05",
    title: "Your environment is live",
    body: "The dashboard shows your access details: Cognito user pool and client IDs, the API endpoint, DynamoDB table names, and your CloudFront domain, everything a frontend needs to start signing users up against a tenant-isolated backend. From here it's product work: wire your UI to the API, push code through the included CI/CD pipelines, and ship.",
    aside: "yours to build on",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <section className="border-b border-line">
        <div className="mx-auto max-w-wrap px-5 py-16 lg:py-20">
          <Kicker>How it works</Kicker>
          <SectionTitle>Sign up → connect AWS → configure → provisioned → live</SectionTitle>
          <p className="mt-3 max-w-2xl text-ink-soft">
            The entire fulfillment path is automated. Between choosing a plan and getting a
            live environment, no human, including us, is in the loop.
          </p>
        </div>
      </section>

      <section className="border-b border-line bg-white">
        <div className="mx-auto max-w-wrap px-5 py-16">
          <ol className="space-y-0">
            {STAGES.map((s, i) => (
              <li
                key={s.k}
                className={`grid gap-4 py-10 md:grid-cols-[90px_1fr_160px] md:gap-8 ${
                  i > 0 ? "border-t border-line" : ""
                }`}
              >
                <p className="display-wide font-display text-3xl font-bold text-cargo">{s.k}</p>
                <div>
                  <h3 className="display-wide font-display text-xl font-bold text-ink">
                    {s.title}
                  </h3>
                  <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
                    {s.body}
                  </p>
                </div>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-faint md:pt-2 md:text-right">
                  {s.aside}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-b border-line bg-console text-paper">
        <div className="mx-auto max-w-wrap px-5 py-16">
          <p className="mb-3 flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-console-dim">
            <span aria-hidden className="inline-block h-[3px] w-5 bg-cargo" />
            The access model, precisely
          </p>
          <h2 className="display-wide font-display text-2xl font-bold sm:text-3xl">
            One role. One External ID. Zero stored keys.
          </h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              [
                "Cross-account role",
                "Access is a standard AWS cross-account IAM role you create in your own account from our published template. It is the only credential involved.",
              ],
              [
                "External ID",
                "Every customer gets a unique External ID baked into the role's trust policy, the AWS-recommended defense against confused-deputy access. Assume-role calls without it fail.",
              ],
              [
                "Scoped and revocable",
                "The role's policy is scoped to diab-* resources, with account-wide access only where AWS offers no name scoping (and we say exactly where). Delete the role and our access ends instantly.",
              ],
            ].map(([t, b]) => (
              <div key={t} className="border-t-2 border-console-line pt-4">
                <h3 className="font-display text-base font-bold">{t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300/80">{b}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 font-mono text-[12px] text-console-dim">
            Read the exact policy: <a href="/connector-role.yaml" className="text-console-green underline underline-offset-4">connector-role.yaml</a>
          </p>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-wrap px-5 py-16 text-center">
          <h2 className="display-wide font-display text-2xl font-bold text-ink sm:text-3xl">
            Twenty minutes from now, this could be running in your account.
          </h2>
          <div className="mt-7 flex justify-center gap-4">
            <ButtonLink href="/pricing" className="px-7 py-3">See pricing</ButtonLink>
            <ButtonLink href="/faq" variant="outline" className="px-7 py-3">Read the FAQ</ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
