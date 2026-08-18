import { redirect } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import { getOrgContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login?next=/dashboard");
  return (
    <DashboardShell
      orgName={ctx.org.name}
      plan={ctx.org.plan}
      userName={ctx.user.name}
      isAdmin={ctx.user.platformRole === "admin"}
    >
      {children}
    </DashboardShell>
  );
}
