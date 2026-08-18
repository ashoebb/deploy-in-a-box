import Link from "next/link";
import { Wordmark } from "./SiteNav";

export default function SiteFooter() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto grid max-w-wrap gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Wordmark />
          <p className="mt-4 max-w-56 text-sm text-ink-faint">
            Production multi-tenant SaaS infrastructure, provisioned into your AWS account automatically.
          </p>
        </div>
        <div>
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">Product</p>
          <ul className="space-y-2 text-sm text-ink-soft">
            <li><Link href="/how-it-works" className="hover:text-ink">How it works</Link></li>
            <li><Link href="/pricing" className="hover:text-ink">Pricing</Link></li>
            <li><Link href="/trial" className="hover:text-ink">Free trial</Link></li>
            <li><Link href="/faq" className="hover:text-ink">FAQ</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">Account</p>
          <ul className="space-y-2 text-sm text-ink-soft">
            <li><Link href="/signup" className="hover:text-ink">Create account</Link></li>
            <li><Link href="/login" className="hover:text-ink">Sign in</Link></li>
            <li><Link href="/dashboard" className="hover:text-ink">Dashboard</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">Security</p>
          <ul className="space-y-2 text-sm text-ink-soft">
            <li><a href="/connector-role.yaml" className="hover:text-ink">Connector role template</a></li>
            <li><Link href="/faq#security" className="hover:text-ink">AWS access model</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-wrap items-center justify-between px-5 py-4">
          <p className="font-mono text-[11px] text-ink-faint">© {new Date().getFullYear()} Deploy-in-a-Box</p>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-faint">Handle with code ▣</p>
        </div>
      </div>
    </footer>
  );
}
