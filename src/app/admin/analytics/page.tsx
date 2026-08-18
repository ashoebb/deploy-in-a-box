import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { Card, Kicker } from "@/components/ui";

export const metadata: Metadata = { title: "Admin · Analytics" };
export const dynamic = "force-dynamic";

/**
 * Platform analytics computed live from the database. Everything here is
 * activity the platform already stores; no customer AWS data is involved.
 */
export default async function AdminAnalyticsPage() {
  const [totals] = (
    await db.execute(sql`
      select
        (select count(*) from users)                                                   as users,
        (select count(*) from organizations)                                           as orgs,
        (select count(*) from organizations where plan not in ('none'))                as orgs_with_plan,
        (select count(*) from organizations where plan = 'trial')                      as trials_active,
        (select count(*) from deployments where status = 'completed')                  as envs_live,
        (select count(*) from deployments where status = 'failed')                     as envs_failed,
        (select count(*) from releases where status = 'completed')                     as releases_ok,
        (select count(*) from releases where status = 'failed')                        as releases_failed,
        (select count(*) from trial_applications)                                      as trial_apps,
        (select count(*) from trial_applications where status = 'approved')            as trial_approved,
        (select count(*) from trial_applications where status = 'pending')             as trial_pending
    `)
  ).rows as Record<string, string>[];

  const planMix = (
    await db.execute(sql`
      select plan, count(*)::int as n
      from organizations group by plan order by n desc
    `)
  ).rows as { plan: string; n: number }[];

  const daily = (
    await db.execute(sql`
      with days as (
        select generate_series(current_date - interval '13 days', current_date, '1 day')::date as d
      )
      select
        to_char(days.d, 'MM-DD') as day,
        (select count(*) from users u where u.created_at::date = days.d)::int        as signups,
        (select count(*) from deployments p where p.created_at::date = days.d)::int  as provisions,
        (select count(*) from releases r where r.created_at::date = days.d)::int     as releases
      from days order by days.d
    `)
  ).rows as { day: string; signups: number; provisions: number; releases: number }[];

  const t = (k: string) => Number(totals?.[k] ?? 0);
  const conversion = t("trial_apps") > 0 ? Math.round((t("trial_approved") / t("trial_apps")) * 100) : 0;
  const maxDay = Math.max(1, ...daily.map((d) => d.signups + d.provisions + d.releases));

  const stats: [string, number | string, string][] = [
    ["Users", t("users"), "accounts created"],
    ["Organizations", t("orgs"), `${t("orgs_with_plan")} with a plan or trial`],
    ["Active trials", t("trials_active"), `${t("trial_pending")} applications pending`],
    ["Live environments", t("envs_live"), `${t("envs_failed")} failed runs total`],
    ["Releases shipped", t("releases_ok"), `${t("releases_failed")} failed`],
    ["Trial approval rate", `${conversion}%`, `${t("trial_approved")} of ${t("trial_apps")} applications`],
  ];

  return (
    <div className="space-y-6">
      <div>
        <Kicker>Admin</Kicker>
        <h1 className="display-wide font-display text-2xl font-bold text-ink">Analytics</h1>
        <p className="mt-1 text-sm text-ink-faint">
          Live platform activity. For payment revenue, refunds, and MRR use the Stripe
          dashboard, which stays the financial source of truth.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map(([label, value, sub]) => (
          <Card key={label}>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">{label}</p>
            <p className="mt-1 display-wide font-display text-3xl font-bold text-ink">{value}</p>
            <p className="mt-1 text-[12px] text-ink-faint">{sub}</p>
          </Card>
        ))}
      </div>

      <Card title="Plan mix">
        <div className="flex flex-wrap gap-6">
          {planMix.map((p) => (
            <div key={p.plan}>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                {p.plan === "none" ? "no plan" : p.plan}
              </p>
              <p className="display-wide font-display text-2xl font-bold text-ink">{p.n}</p>
            </div>
          ))}
          {planMix.length === 0 && <p className="text-sm text-ink-faint">No organizations yet.</p>}
        </div>
      </Card>

      <Card title="Last 14 days · signups, provisioning runs, releases">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-ink/20 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                <th className="py-2 pr-4 font-medium">Day</th>
                <th className="py-2 pr-4 font-medium">Signups</th>
                <th className="py-2 pr-4 font-medium">Provisions</th>
                <th className="py-2 pr-4 font-medium">Releases</th>
                <th className="py-2 font-medium">Activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {daily.map((d) => {
                const total = d.signups + d.provisions + d.releases;
                return (
                  <tr key={d.day}>
                    <td className="py-2 pr-4 font-mono text-[12px]">{d.day}</td>
                    <td className="py-2 pr-4 font-mono text-[12px]">{d.signups}</td>
                    <td className="py-2 pr-4 font-mono text-[12px]">{d.provisions}</td>
                    <td className="py-2 pr-4 font-mono text-[12px]">{d.releases}</td>
                    <td className="py-2">
                      <div
                        className="h-2 rounded-sm bg-cargo"
                        style={{ width: `${Math.max(2, (total / maxDay) * 100)}%`, opacity: total === 0 ? 0.15 : 1 }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
