import Link from "next/link";
import { Wordmark } from "@/components/SiteNav";

export default function TrialApplyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-wrap items-center justify-between px-5">
          <Wordmark />
          <Link
            href="/dashboard"
            className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink-faint hover:text-ink"
          >
            dashboard →
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
