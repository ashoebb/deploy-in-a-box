"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

export default function PortalButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="text-right">
      <Button
        variant="ink"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await fetch("/api/billing/portal", { method: "POST" });
            const data = (await res.json()) as { url?: string; error?: string };
            if (data.url) window.location.href = data.url;
            else setError(data.error ?? "Couldn't open the portal.");
          } catch {
            setError("Network error.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Opening…" : "Open Stripe customer portal"}
      </Button>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
