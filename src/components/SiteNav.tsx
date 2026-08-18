import Link from "next/link";
import { ButtonLink } from "./ui";

export function Wordmark({ dark = false }: { dark?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span
        aria-hidden
        className={`grid h-7 w-7 place-items-center rounded-[4px] border-2 ${
          dark ? "border-paper text-paper" : "border-ink text-ink"
        } font-mono text-[13px] font-bold`}
      >
        ▣
      </span>
      <span
        className={`display-wide font-display text-[15px] font-bold tracking-tight ${
          dark ? "text-paper" : "text-ink"
        }`}
      >
        DEPLOY-IN-A-BOX
      </span>
    </Link>
  );
}

export default function SiteNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-wrap items-center justify-between px-5">
        <Wordmark />
        <nav className="hidden items-center gap-7 text-sm font-medium text-ink-soft md:flex">
          <Link href="/how-it-works" className="hover:text-ink">How it works</Link>
          <Link href="/pricing" className="hover:text-ink">Pricing</Link>
          <Link href="/faq" className="hover:text-ink">FAQ</Link>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm font-medium text-ink-soft hover:text-ink">
            Sign in
          </Link>
          <ButtonLink href="/pricing" className="px-4 py-2">
            Start now
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}
