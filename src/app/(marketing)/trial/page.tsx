import Link from "next/link";
import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { trialSettings } from "@/db/schema";
import { ButtonLink, Kicker, SectionTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Free trial" };
export const dynamic = "force-dynamic";

export default async function TrialPage() {
  let slotsLeft: number | null = null;
  let cutoff: Date | null = null;
  let open = false;
  try {
    const s = await db.query.trialSettings.findFirst({ where: eq(trialSettings.id, "default") });
    if (s) {
      slotsLeft = Math.max(0, s.slotsTotal - s.slotsUsed);
      cutoff = s.cutoffDate;
      open = slotsLeft > 0 && (!cutoff || cutoff.getTime() > Date.now());
    }
  } catch {
    // DB unreachable, render the page without live numbers.
  }

  return (
    <section className="mx-auto max-w-wrap px-5 py-16 lg:py-20">
      <Kicker>Free trial · limited slots</Kicker>
      <SectionTitle>Provision a real environment before you pay</SectionTitle>
      <p className="mt-3 max-w-2xl text-ink-soft">
        Trial slots give qualifying teams full automated provisioning for one environment in
        their own AWS account, the actual product, not a sandbox. Slots are limited and
        applications are reviewed, so tell us what you&apos;re building.
      </p>

      <div className="mt-10 grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="rounded-[6px] border border-line bg-white p-7">
          <h3 className="font-display text-lg font-bold text-ink">What a trial includes</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-ink-soft">
            {[
              "One environment (staging) provisioned into your AWS account",
              "The full module set: tenancy, auth, billing hooks, CI/CD templates, AWS scaffolding",
              "Live provisioning logs and environment details in the dashboard",
              "No card required for the trial itself, AWS usage bills to your account as usual",
            ].map((f) => (
              <li key={f} className="flex gap-2.5">
                <span aria-hidden className="mt-0.5 font-mono text-emerald-700">✓</span>
                {f}
              </li>
            ))}
          </ul>
          <h3 className="mt-8 font-display text-lg font-bold text-ink">How applications work</h3>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            You&apos;ll create an account and answer four questions: your business, your project
            stage, your AWS familiarity, and what you intend to build. While slots remain and
            the window is open, qualifying applications are approved automatically,
            otherwise they queue for review and you&apos;ll hear back by email.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-[6px] border-2 border-dashed border-cargo/60 bg-cargo-tint/40 p-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-cargo-dark">
              Slot status
            </p>
            {slotsLeft === null ? (
              <p className="mt-2 text-sm text-ink-soft">
                Slot availability is shown here once the trial window is configured.
              </p>
            ) : open ? (
              <>
                <p className="display-wide mt-2 font-display text-3xl font-bold text-ink">
                  {slotsLeft} {slotsLeft === 1 ? "slot" : "slots"} left
                </p>
                {cutoff && (
                  <p className="mt-1 font-mono text-[12px] text-ink-faint">
                    window closes {cutoff.toISOString().slice(0, 10)}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-soft">
                The current trial window is full or closed. Applications still queue for the
                next window.
              </p>
            )}
          </div>
          <ButtonLink href="/trial/apply" className="w-full py-3">
            Apply for a trial slot
          </ButtonLink>
          <p className="text-center text-xs text-ink-faint">
            Prefer to skip the queue? <Link href="/pricing" className="underline underline-offset-4">See plans</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
