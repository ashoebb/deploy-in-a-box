"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Field, Input, Kicker, StatusBadge } from "@/components/ui";
import { usePost } from "@/components/useForm";

type Settings = {
  slotsTotal: number;
  slotsUsed: number;
  cutoffDate: string; // yyyy-mm-dd or ""
  autoApprove: boolean;
  trialLengthDays: number;
};

type Application = {
  id: string;
  orgName: string;
  businessName: string;
  website: string;
  projectStage: string;
  awsFamiliarity: string;
  useCase: string;
  status: "pending" | "approved" | "rejected";
  decisionNote: string;
  createdAt: string;
};

export default function TrialsAdminClient({
  settings: initial,
  applications,
}: {
  settings: Settings;
  applications: Application[];
}) {
  const router = useRouter();
  const settingsPost = usePost();
  const decisionPost = usePost();
  const [settings, setSettings] = useState(initial);
  const [saved, setSaved] = useState(false);

  async function saveSettings() {
    setSaved(false);
    const res = await settingsPost.post<{ ok: true }>("/api/admin/trial-settings", settings);
    if (res) {
      setSaved(true);
      router.refresh();
    }
  }

  async function decide(id: string, decision: "approved" | "rejected") {
    const note =
      decision === "rejected"
        ? window.prompt("Optional note shown to the applicant:") ?? ""
        : "";
    const res = await decisionPost.post<{ ok: true }>("/api/admin/trial-decision", {
      applicationId: id,
      decision,
      decisionNote: note,
    });
    if (res) router.refresh();
  }

  const pending = applications.filter((a) => a.status === "pending");
  const decided = applications.filter((a) => a.status !== "pending");

  return (
    <div className="space-y-6">
      <div>
        <Kicker>Admin</Kicker>
        <h1 className="display-wide font-display text-2xl font-bold text-ink">Trial program</h1>
      </div>

      {/* ── Window settings ─────────────────────────────────────────────── */}
      <Card title="Trial window settings">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Total slots">
            <Input
              type="number"
              min={0}
              value={settings.slotsTotal}
              onChange={(e) => setSettings({ ...settings, slotsTotal: Number(e.target.value) })}
            />
          </Field>
          <Field label="Slots used" hint="Auto-incremented on approval">
            <Input
              type="number"
              min={0}
              value={settings.slotsUsed}
              onChange={(e) => setSettings({ ...settings, slotsUsed: Number(e.target.value) })}
            />
          </Field>
          <Field label="Cutoff date" hint="Empty = no cutoff">
            <Input
              type="date"
              value={settings.cutoffDate}
              onChange={(e) => setSettings({ ...settings, cutoffDate: e.target.value })}
            />
          </Field>
          <Field label="Trial length (days)">
            <Input
              type="number"
              min={1}
              value={settings.trialLengthDays}
              onChange={(e) => setSettings({ ...settings, trialLengthDays: Number(e.target.value) })}
            />
          </Field>
        </div>
        <label className="mt-4 flex items-center gap-2.5 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={settings.autoApprove}
            onChange={(e) => setSettings({ ...settings, autoApprove: e.target.checked })}
            className="h-4 w-4 accent-cargo"
          />
          Auto-approve applications while slots remain and the window is open
        </label>
        <div className="mt-5 flex items-center gap-3">
          <Button onClick={saveSettings} disabled={settingsPost.busy}>
            {settingsPost.busy ? "Saving…" : "Save settings"}
          </Button>
          {saved && <span className="text-sm text-emerald-700">Saved ✓</span>}
          {settingsPost.error && <span className="text-sm text-red-700">{settingsPost.error}</span>}
        </div>
        <p className="mt-3 font-mono text-[12px] text-ink-faint">
          {Math.max(0, settings.slotsTotal - settings.slotsUsed)} slots remaining
          {settings.cutoffDate ? ` · window closes ${settings.cutoffDate}` : " · no cutoff set"}
        </p>
      </Card>

      {/* ── Pending queue ───────────────────────────────────────────────── */}
      <Card title={`Pending applications · ${pending.length}`}>
        {decisionPost.error && <Alert tone="error">{decisionPost.error}</Alert>}
        {pending.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-faint">Queue is clear.</p>
        ) : (
          <div className="divide-y divide-line">
            {pending.map((a) => (
              <div key={a.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">
                      {a.businessName}
                      <span className="ml-2 font-mono text-[11px] text-ink-faint">({a.orgName})</span>
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wide text-ink-faint">
                      {a.projectStage} · aws: {a.awsFamiliarity} · applied {a.createdAt}
                      {a.website && (
                        <>
                          {" · "}
                          <a href={a.website} target="_blank" rel="noreferrer" className="underline">
                            site
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      className="px-3.5 py-1.5 text-xs"
                      disabled={decisionPost.busy}
                      onClick={() => decide(a.id, "approved")}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="danger"
                      className="px-3.5 py-1.5 text-xs"
                      disabled={decisionPost.busy}
                      onClick={() => decide(a.id, "rejected")}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft">{a.useCase}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── History ─────────────────────────────────────────────────────── */}
      <Card title={`Decided · ${decided.length}`}>
        {decided.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-faint">No decisions yet.</p>
        ) : (
          <div className="divide-y divide-line">
            {decided.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{a.businessName}</p>
                  {a.decisionNote && (
                    <p className="truncate text-[12px] text-ink-faint">note: {a.decisionNote}</p>
                  )}
                </div>
                <StatusBadge status={a.status} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
