import type { Metadata } from "next";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { deployments, organizations, users, memberships } from "@/db/schema";
import { Card, Kicker, StatusBadge } from "@/components/ui";
import OrgActions from "./OrgActions";

export const metadata: Metadata = { title: "Admin · Customers" };
export const dynamic = "force-dynamic";

export default async function AdminCustomersPage() {
  const orgs = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      plan: organizations.plan,
      subscriptionStatus: organizations.subscriptionStatus,
      trialEndsAt: organizations.trialEndsAt,
      createdAt: organizations.createdAt,
      ownerEmail: sql<string>`min(${users.email})`,
      envCount: sql<number>`count(distinct ${deployments.id}) filter (where ${deployments.status} not in ('failed','deleted'))`,
    })
    .from(organizations)
    .leftJoin(memberships, eq(memberships.orgId, organizations.id))
    .leftJoin(users, eq(users.id, memberships.userId))
    .leftJoin(deployments, eq(deployments.orgId, organizations.id))
    .groupBy(organizations.id)
    .orderBy(desc(organizations.createdAt));

  return (
    <div className="space-y-6">
      <div>
        <Kicker>Admin</Kicker>
        <h1 className="display-wide font-display text-2xl font-bold text-ink">Customers</h1>
      </div>

      <Card title={`All organizations · ${orgs.length}`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-ink/20 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                <th className="py-2 pr-4 font-medium">Organization</th>
                <th className="py-2 pr-4 font-medium">Owner</th>
                <th className="py-2 pr-4 font-medium">Plan</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Envs</th>
                <th className="py-2 pr-4 font-medium">Joined</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {orgs.map((o) => (
                <tr key={o.id}>
                  <td className="py-2.5 pr-4 font-medium text-ink">{o.name}</td>
                  <td className="py-2.5 pr-4 text-ink-soft">{o.ownerEmail ?? ", "}</td>
                  <td className="py-2.5 pr-4"><StatusBadge status={o.plan === "none" ? "no plan" : o.plan} /></td>
                  <td className="py-2.5 pr-4 text-ink-soft">
                    {o.subscriptionStatus}
                    {o.plan === "trial" && o.trialEndsAt
                      ? ` → ${o.trialEndsAt.toISOString().slice(0, 10)}`
                      : ""}
                  </td>
                  <td className="py-2.5 pr-4 font-mono">{o.envCount}</td>
                  <td className="py-2.5 pr-4 font-mono text-[12px] text-ink-faint">
                    {o.createdAt.toISOString().slice(0, 10)}
                  </td>
                  <td className="py-2.5">
                    <OrgActions orgId={o.id} plan={o.plan} />
                  </td>
                </tr>
              ))}
              {orgs.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-ink-faint">
                    No organizations yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
