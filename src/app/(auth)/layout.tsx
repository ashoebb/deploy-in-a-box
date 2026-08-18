import Link from "next/link";
import { Wordmark } from "@/components/SiteNav";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-wrap items-center justify-between px-5">
          <Wordmark />
          <Link href="/" className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink-faint hover:text-ink">
            ← back to site
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-5 py-14">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
