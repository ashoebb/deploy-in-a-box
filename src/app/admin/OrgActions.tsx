"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Row-level admin actions on the customers table. */
export default function OrgActions({ orgId, plan }: { orgId: string; plan: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function act(action: "cancel_trial" | "cancel_plan", confirmMsg: string) {
    if (!window.confirm(confirmMsg)) return;
    setBusy(true);
    setNote(null);
    const res = await fetch("/api/admin/org-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, action }),
    });
    const d = (await res.json()) as { note?: string; error?: string };
    setBusy(false);
    setNote(d.note ?? d.error ?? null);
    router.refresh();
  }

  return (
    <div className="text-right">
      {plan === "trial" && (
        <button
          disabled={busy}
          onClick={() =>
            act("cancel_trial", "End this trial now? Their plan drops to none; their AWS infrastructure is untouched.")
          }
          className="font-mono text-[11px] uppercase tracking-wide text-red-700 hover:underline"
        >
          end trial
        </button>
      )}
      {plan !== "trial" && plan !== "none" && (
        <button
          disabled={busy}
          onClick={() =>
            act("cancel_plan", "Cancel this subscription at period end? Use the Stripe dashboard for refunds.")
          }
          className="font-mono text-[11px] uppercase tracking-wide text-red-700 hover:underline"
        >
          cancel plan
        </button>
      )}
      {note && <p className="mt-1 max-w-[180px] text-[11px] leading-snug text-ink-faint">{note}</p>}
    </div>
  );
}
