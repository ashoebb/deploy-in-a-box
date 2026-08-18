import Link from "next/link";
import { Wordmark } from "./SiteNav";
import LogoutButton from "./LogoutButton";
import { StatusBadge } from "./ui";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/provision", label: "Provision" },
  { href: "/dashboard/git", label: "Git & CI/CD" },
  { href: "/dashboard/billing", label: "Billing" },
  { href: "/dashboard/support", label: "Support" },
];

export default function DashboardShell({
  children,
  orgName,
  plan,
  userName,
  isAdmin,
}: {
  children: React.ReactNode;
  orgName: string;
  plan: string;
  userName: string;
  isAdmin?: boolean;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-wrap items-center justify-between px-5">
          <div className="flex items-center gap-4">
            <Wordmark />
            <span className="hidden rounded-[3px] border border-line px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint sm:inline">
              {orgName}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <StatusBadge status={plan === "none" ? "no plan" : plan} />
            {isAdmin && (
              <Link
                href="/admin"
                className="font-mono text-[11px] uppercase tracking-[0.14em] text-cargo hover:text-cargo-dark"
              >
                Admin
              </Link>
            )}
            <span className="hidden text-sm text-ink-faint md:inline">{userName}</span>
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
