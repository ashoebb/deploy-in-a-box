import Link from "next/link";
import ProvisionConsole from "@/components/ProvisionConsole";
import { ButtonLink, Kicker, SectionTitle } from "@/components/ui";

// ─────────────────────────────────────────────────────────────────────────────
// PLACEHOLDER TESTIMONIALS, replace before launch.
// Search for "PLACEHOLDER" to find every instance. Do not ship these.
// ─────────────────────────────────────────────────────────────────────────────
const PLACEHOLDER_TESTIMONIALS = [
  {
    quote:
      "PLACEHOLDER, Replace with a real customer quote about time saved reaching production.",
    name: "PLACEHOLDER Name",
    role: "PLACEHOLDER Title, Company",
  },
  {
    quote:
      "PLACEHOLDER, Replace with a real quote from an agency about deploying client backends.",
    name: "PLACEHOLDER Name",
    role: "PLACEHOLDER Title, Agency",
  },
  {
    quote:
      "PLACEHOLDER, Replace with a real quote about the security model / cross-account role.",
    name: "PLACEHOLDER Name",
    role: "PLACEHOLDER Title, Company",
  },
];

const MANIFEST = [
  {
    module: "Multi-tenancy",
    spec: "Tenant-isolated DynamoDB single-table data layer. Every key is tenant-scoped; the API derives the tenant from the caller's token, no cross-tenant reads by construction.",
    detail: "DynamoDB · GSI access patterns · tenant registry",
  },
  {
    module: "Auth",
    spec: "AWS Cognito user pool with signup, login, email verification, roles, and tenant claims, pre-wired to a JWT-protected API. Drop in any frontend.",
    detail: "Cognito · JWT authorizer · custom claims",
  },
  {
    module: "Billing",
    spec: "Stripe integration hooks for subscription plans, plus a metered usage-events pipeline for usage-based pricing when you're ready for it.",
    detail: "Stripe subscriptions · usage metering hooks",
  },
  {
    module: "CI / CD",
    spec: "GitHub Actions pipelines that deploy on push, with separate staging and production environments and infrastructure changes reviewed as code.",
    detail: "GitHub Actions · staging + production",
  },
  {
    module: "AWS scaffolding",
    spec: "Lambda, API Gateway, CloudFront, and S3 defined entirely in CloudFormation, the same 40+ endpoint architecture pattern proven in production SaaS.",
    detail: "Lambda · API Gateway · CloudFront · S3 · IaC",
  },
];

const STEPS = [
  { k: "01", title: "Sign up", body: "Create your business account and pick a plan." },
  {
    k: "02",
    title: "Connect AWS",
    body: "Run our one-click connector-role stack in your account. You grant a scoped role, we never see your keys.",
  },
  {
    k: "03",
    title: "Configure",
    body: "Name the project, choose a region, toggle the modules you want.",
  },
  {
    k: "04",
    title: "Automated provisioning",
    body: "The platform assumes your role and deploys the stack. Watch every resource land, live.",
  },
  {
    k: "05",
    title: "Live environment",
    body: "Endpoints, pool IDs, and CDN domain appear in your dashboard. Start building product.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="border-b border-line">
        <div className="mx-auto grid max-w-wrap items-center gap-12 px-5 py-16 lg:grid-cols-[1.05fr_1fr] lg:py-24">
          <div>
            <Kicker>Multi-tenant SaaS infrastructure · sealed &amp; shipped</Kicker>
            <h1 className="display-wide font-display text-4xl font-bold leading-[1.05] text-ink sm:text-5xl lg:text-[3.4rem]">
              The backend your SaaS needs.
              <br />
              <span className="text-cargo">Provisioned in under an hour.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">
              Deploy-in-a-Box ships a production-grade multi-tenant backend, auth, tenant
              isolation, billing hooks, CI/CD, and the full AWS stack as code, straight into
              your own AWS account, automatically. The 2–3 months your engineers would spend
              on platform plumbing goes back into your product.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <ButtonLink href="/pricing" className="px-7 py-3 text-base">
                Start now
              </ButtonLink>
              <ButtonLink href="/trial" variant="outline" className="px-7 py-3 text-base">
                Apply for the free trial
              </ButtonLink>
            </div>
            <p className="mt-5 font-mono text-[12px] uppercase tracking-[0.14em] text-ink-faint">
              Your AWS account · your data · revoke access any time
            </p>
          </div>
          <ProvisionConsole />
        </div>
      </section>

      {/* ── The math ─────────────────────────────────────────────────────── */}
      <section className="border-b border-line bg-white">
        <div className="mx-auto grid max-w-wrap gap-px overflow-hidden px-5 py-0 sm:grid-cols-3">
          {[
            ["2–3 months", "of senior platform engineering avoided per product"],
            ["5 modules", "auth, tenancy, billing, CI/CD, AWS scaffolding, one unit"],
            ["1 IAM role", "is all we ever hold in your account. Delete it, access ends."],
          ].map(([big, small]) => (
            <div key={big} className="border-line px-2 py-10 sm:border-l first:sm:border-l-0">
              <p className="display-wide font-display text-3xl font-bold text-ink">{big}</p>
              <p className="mt-2 max-w-60 text-sm text-ink-faint">{small}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Manifest: what's in the box ──────────────────────────────────── */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-wrap px-5 py-20">
          <Kicker>Bill of materials</Kicker>
          <SectionTitle>What&apos;s in the box</SectionTitle>
          <p className="mt-3 max-w-2xl text-ink-soft">
            Five modules, one sealed unit. Everything below is defined as infrastructure code
            and provisioned together, nothing arrives half-assembled.
          </p>

          <div className="mt-10 overflow-hidden rounded-[6px] border border-ink/20">
            <div className="hidden grid-cols-[180px_1fr_260px_110px] gap-4 border-b border-ink/20 bg-ink px-5 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-paper/80 md:grid">
              <span>Module</span>
              <span>Specification</span>
              <span>Components</span>
              <span className="text-right">Status</span>
            </div>
            {MANIFEST.map((row) => (
              <div
                key={row.module}
                className="grid gap-2 border-b border-line bg-white px-5 py-5 last:border-b-0 md:grid-cols-[180px_1fr_260px_110px] md:gap-4"
              >
                <p className="display-wide font-display text-base font-bold text-ink">
                  {row.module}
                </p>
                <p className="text-sm leading-relaxed text-ink-soft">{row.spec}</p>
                <p className="font-mono text-[12px] leading-relaxed text-ink-faint">
                  {row.detail}
                </p>
                <p className="font-mono text-[11px] uppercase tracking-wide text-emerald-700 md:text-right">
                  ✓ Included
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Process ──────────────────────────────────────────────────────── */}
      <section className="border-b border-line bg-console text-paper">
        <div className="mx-auto max-w-wrap px-5 py-20">
          <p className="mb-3 flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-console-dim">
            <span aria-hidden className="inline-block h-[3px] w-5 bg-cargo" />
            Signup to shipped
          </p>
          <h2 className="display-wide font-display text-3xl font-bold sm:text-4xl">
            From purchase to live environment, hands-free
          </h2>
          <div className="mt-12 grid gap-8 md:grid-cols-5">
            {STEPS.map((s) => (
              <div key={s.k} className="border-t-2 border-console-line pt-4">
                <p className="font-mono text-[12px] text-cargo">{s.k}</p>
                <h3 className="mt-2 font-display text-lg font-bold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300/80">{s.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-12">
            <ButtonLink href="/how-it-works" variant="primary">
              See the full walkthrough
            </ButtonLink>
          </div>
        </div>
      </section>

      {/* ── Who it's for ─────────────────────────────────────────────────── */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-wrap px-5 py-20">
          <Kicker>Built for teams that ship</Kicker>
          <SectionTitle>Three buyers, one problem</SectionTitle>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              {
                t: "Funded startups",
                b: "You raised to build product, not to spend a quarter on tenancy, auth, and pipelines. Get to your first paying customer on infrastructure that won't need a rewrite at scale.",
              },
              {
                t: "Software agencies",
                b: "Every client SaaS starts with the same backend. Provision it per client account in an afternoon, keep your margin, and hand over infrastructure defined entirely as code.",
              },
              {
                t: "Internal product teams",
                b: "New internal tools shouldn't wait on a platform team's backlog. Spin up isolated, compliant-by-default environments inside accounts your org already governs.",
              },
            ].map((c) => (
              <div key={c.t} className="rounded-[6px] border border-line bg-white p-6">
                <h3 className="display-wide font-display text-xl font-bold text-ink">{c.t}</h3>
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">{c.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials (clearly-labeled placeholders) ──────────────────── */}
      <section className="border-b border-line bg-white">
        <div className="mx-auto max-w-wrap px-5 py-20">
          <Kicker>Field reports</Kicker>
          <SectionTitle>What customers say</SectionTitle>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {PLACEHOLDER_TESTIMONIALS.map((t, i) => (
              <figure
                key={i}
                className="rounded-[6px] border border-dashed border-cargo/50 bg-cargo-tint/40 p-6"
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-cargo-dark">
                  Placeholder, replace before launch
                </p>
                <blockquote className="mt-3 text-sm leading-relaxed text-ink-soft">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-4 text-sm">
                  <span className="font-semibold text-ink">{t.name}</span>
                  <span className="block text-ink-faint">{t.role}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section>
        <div className="mx-auto max-w-wrap px-5 py-20">
          <div className="rounded-[6px] border-2 border-ink bg-white px-8 py-12 text-center sm:px-16">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-faint">
              Ready to unpack
            </p>
            <h2 className="display-wide mx-auto mt-3 max-w-2xl font-display text-3xl font-bold text-ink sm:text-4xl">
              Stop building the same backend. Start building your product.
            </h2>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <ButtonLink href="/pricing" className="px-8 py-3 text-base">
                View pricing
              </ButtonLink>
              <Link href="/faq" className="text-sm font-medium text-ink-soft underline underline-offset-4 hover:text-ink">
                Read the security FAQ first
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
