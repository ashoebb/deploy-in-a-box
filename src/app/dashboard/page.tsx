import Link from "next/link";
import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { deployments, trialApplications } from "@/db/schema";
import { getOrgContext } from "@/lib/auth";
import { maxEnvironmentsForPlan, PLANS } from "@/lib/plans";
import { Alert, ButtonLink, Card, Kicker, StatusBadge } from "@/components/ui";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { checkout?: string };
}) {
  const ctx = (await getOrgContext())!;
  const { org } = ctx;

  const [runs, trialApp] = await Promise.all([
    db
      .select()
      .from(deployments)
      .where(eq(deployments.orgId, org.id))
      .orderBy(desc(deployments.createdAt)),
    db.query.trialApplications.findFirst({ where: eq(trialApplications.orgId, org.id) }),
  ]);

  const activeCount = runs.filter((r) => r.status !== "failed" && r.status !== "deleted").length;
  const limit = maxEnvironmentsForPlan(org.plan);
  const planDef = PLANS.find((p) => p.id === org.plan);
  const orgActive = org.subscriptionStatus === "active" || org.subscriptionStatus === "trialing";
  const trialExpired =
    org.plan === "trial" && org.trialEndsAt && org.trialEndsAt.getTime() < Date.now();

  return (
    <div className="space-y-6">
      {searchParams.checkout === "success" && (
        <Alert tone="success">
          Payment confirmed, your subscription is being activated. If the plan badge still
          says “no plan” after a few seconds, refresh; activation lands via Stripe webhook.
        </Alert>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Kicker>Overview</Kicker>
          <h1 className="display-wide font-display text-2xl font-bold text-ink">
            {org.name}
          </h1>
        </div>
        <ButtonLink href="/dashboard/provision">+ Provision environment</ButtonLink>
      </div>

      {/* ── Plan state ──────────────────────────────────────────────────── */}
      {!orgActive && !trialApp && (
        <Alert tone="warn">
          No active plan yet. <Link href="/pricing" className="font-medium underline underline-offset-4">Choose a plan</Link> or{" "}
          <Link href="/trial/apply" className="font-medium underline underline-offset-4">apply for a trial slot</Link> to
          unlock provisioning.
        </Alert>
      )}
      {trialApp?.status === "pending" && (
        <Alert tone="info">
          Your trial application is in review. You&apos;ll get an email when a decision lands,
          approved trials unlock provisioning immediately.
        </Alert>
      )}
      {trialApp?.status === "rejected" && (
        <Alert tone="warn">
          Your trial application wasn&apos;t approved this window
          {trialApp.decisionNote ? `, “${trialApp.decisionNote}”` : ""}. You can still{" "}
          <Link href="/pricing" className="font-medium underline underline-offset-4">start on a paid plan</Link>.
        </Alert>
      )}
      {trialExpired && (
        <Alert tone="warn">
          Your trial ended on {org.trialEndsAt!.toISOString().slice(0, 10)}. Provisioned
          infrastructure keeps running in your AWS account;{" "}
          <Link href="/pricing" className="font-medium underline underline-offset-4">pick a plan</Link> to provision more.
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <Card
          title="Plan"
          action={<Link href="/dashboard/billing" className="text-sm text-ink-soft underline underline-offset-4">Manage</Link>}
        >
          <p className="display-wide font-display text-2xl font-bold text-ink">
            {org.plan === "none" ? ", " : planDef?.name ?? org.plan}
          </p>
          <p className="mt-1 text-sm text-ink-faint">
            status: {org.subscriptionStatus}
            {org.plan === "trial" && org.trialEndsAt
              ? ` · ends ${org.trialEndsAt.toISOString().slice(0, 10)}`
              : ""}
          </p>
        </Card>
        <Card title="Environments">
          <p className="display-wide font-display text-2xl font-bold text-ink">
            {activeCount} <span className="text-base font-normal text-ink-faint">/ {limit}</span>
          </p>
          <p className="mt-1 text-sm text-ink-faint">used on this plan</p>
        </Card>
        <Card title="AWS access">
          <p className="text-sm leading-relaxed text-ink-soft">
            One scoped role in your account. Full details and revocation on the{" "}
            <Link href="/dashboard/provision" className="underline underline-offset-4">provision page</Link>.
          </p>
        </Card>
      </div>

      {/* ── Runs ────────────────────────────────────────────────────────── */}
      <Card title="Environments & provisioning runs">
        {runs.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-faint">
            Nothing provisioned yet. Your first environment is about 20 minutes away,{" "}
            <Link href="/dashboard/provision" className="underline underline-offset-4">start here</Link>.
          </p>
        ) : (
          <div className="divide-y divide-line">
            {runs.map((run) => (
              <Link
                key={run.id}
                href={`/dashboard/environments/${run.id}`}
                className="flex items-center justify-between gap-4 py-3.5 hover:bg-paper"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm text-ink">{run.stackName}</p>
                  <p className="font-mono text-[11px] text-ink-faint">
                    {run.region} · created {run.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                  </p>
                </div>
                <StatusBadge status={run.status} />
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
