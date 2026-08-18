import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/auth";
import { Wordmark } from "@/components/SiteNav";
import LogoutButton from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "Customers" },
  { href: "/admin/trials", label: "Trial program" },
  { href: "/admin/deployments", label: "Provisioning" },
  { href: "/admin/analytics", label: "Analytics" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login?next=/admin");
  if (ctx.user.platformRole !== "admin") redirect("/dashboard");

  return (
    <div className="min-h-screen">
      <header className="border-b-2 border-cargo bg-ink text-paper">
        <div className="mx-auto flex h-16 max-w-wrap items-center justify-between px-5">
          <div className="flex items-center gap-4">
            <Wordmark dark />
            <span className="rounded-[3px] bg-cargo px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white">
              Admin
            </span>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/dashboard" className="font-mono text-[11px] uppercase tracking-[0.14em] text-paper/70 hover:text-paper">
              Exit to dashboard
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-wrap gap-8 px-5 py-8 lg:grid-cols-[190px_1fr]">
        <nav className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-0.5">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-[4px] px-3 py-2 text-sm font-medium text-ink-soft hover:bg-white hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
