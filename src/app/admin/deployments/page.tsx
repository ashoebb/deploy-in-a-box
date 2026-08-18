import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { deployments, organizations } from "@/db/schema";
import { Card, Kicker, StatusBadge } from "@/components/ui";

export const metadata: Metadata = { title: "Admin · Provisioning" };
export const dynamic = "force-dynamic";

export default async function AdminDeploymentsPage() {
  const rows = await db
    .select({
      id: deployments.id,
      stackName: deployments.stackName,
      region: deployments.region,
      status: deployments.status,
      errorMessage: deployments.errorMessage,
      createdAt: deployments.createdAt,
      finishedAt: deployments.finishedAt,
      orgName: organizations.name,
    })
    .from(deployments)
    .innerJoin(organizations, eq(organizations.id, deployments.orgId))
    .orderBy(desc(deployments.createdAt))
    .limit(200);

  const active = rows.filter((r) => ["queued", "validating", "provisioning"].includes(r.status));

  return (
    <div className="space-y-6">
      <div>
        <Kicker>Admin</Kicker>
        <h1 className="display-wide font-display text-2xl font-bold text-ink">
          Provisioning runs
        </h1>
        <p className="mt-1 text-sm text-ink-faint">
          {active.length} active · showing latest {rows.length}
        </p>
      </div>

      <Card title="All runs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-ink/20 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                <th className="py-2 pr-4 font-medium">Stack</th>
                <th className="py-2 pr-4 font-medium">Customer</th>
                <th className="py-2 pr-4 font-medium">Region</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-2.5 pr-4">
                    <p className="font-mono text-[13px] text-ink">{r.stackName}</p>
                    {r.errorMessage && (
                      <p className="mt-0.5 max-w-md truncate text-[12px] text-red-700">{r.errorMessage}</p>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 text-ink-soft">{r.orgName}</td>
                  <td className="py-2.5 pr-4 font-mono text-[12px]">{r.region}</td>
                  <td className="py-2.5 pr-4"><StatusBadge status={r.status} /></td>
                  <td className="py-2.5 font-mono text-[12px] text-ink-faint">
                    {(r.finishedAt ?? r.createdAt).toISOString().slice(0, 16).replace("T", " ")}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-ink-faint">No runs yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
