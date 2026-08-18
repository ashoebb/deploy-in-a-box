"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Field, Input, StatusBadge } from "@/components/ui";
import { usePost } from "@/components/useForm";

export type ReleaseRow = {
  id: string;
  gitSha: string;
  trigger: string;
  status: string;
  commitMessage: string | null;
  commitAuthor: string | null;
  createdAt: string;
};

type EnvVarRow = { id: string; key: string; isSecret: boolean; valueMasked: string; updatedAt: string };

/** Day-2 ops for a provisioned environment: releases + environment variables. */
export default function EnvOpsPanel({
  environmentId,
  releases,
}: {
  environmentId: string;
  releases: ReleaseRow[];
}) {
  const router = useRouter();

  // ── manual deploy ──────────────────────────────────────────────────────
  const deploy = usePost();
  async function runDeploy() {
    const res = await deploy.post<{ ok: true; releaseId: string }>(
      `/api/environments/${environmentId}/deploy`,
      {}
    );
    if (res) router.push(`/dashboard/releases/${res.releaseId}`);
  }

  // ── env vars ───────────────────────────────────────────────────────────
  const [vars, setVars] = useState<EnvVarRow[] | null>(null);
  const [varNote, setVarNote] = useState<string | null>(null);
  const varPost = usePost();
  const [form, setForm] = useState({ key: "", value: "" });

  const loadVars = useCallback(async () => {
    const res = await fetch(`/api/environments/${environmentId}/env-vars`, { cache: "no-store" });
    if (res.ok) setVars(((await res.json()) as { envVars: EnvVarRow[] }).envVars);
  }, [environmentId]);

  useEffect(() => {
    loadVars();
  }, [loadVars]);

  async function addVar() {
    setVarNote(null);
    const res = await varPost.post<{ ok: true; note: string }>(
      `/api/environments/${environmentId}/env-vars`,
      { key: form.key, value: form.value, isSecret: true }
    );
    if (res) {
      setForm({ key: "", value: "" });
      setVarNote(res.note);
      loadVars();
    }
  }

  async function deleteVar(key: string) {
    if (!window.confirm(`Delete ${key}? It stops being injected on the next deploy.`)) return;
    await fetch(`/api/environments/${environmentId}/env-vars`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    loadVars();
  }

  return (
    <>
      {/* ── Releases ────────────────────────────────────────────────────── */}
      <Card
        title="Releases"
        action={
          <Button
            variant="ink"
            className="px-3.5 py-1.5 text-xs"
            disabled={deploy.busy}
            onClick={runDeploy}
          >
            {deploy.busy ? "Queuing…" : "Deploy now"}
          </Button>
        }
      >
        {deploy.error && <Alert tone="error">{deploy.error}</Alert>}
        {releases.length === 0 ? (
          <p className="py-4 text-sm text-ink-faint">
            No releases yet. Connect a repository on the{" "}
            <Link href="/dashboard/git" className="underline underline-offset-4">Git &amp; CI/CD page</Link>{" "}
            and every push deploys here, or use <em>Deploy now</em> to run one manually.
          </p>
        ) : (
          <div className="divide-y divide-line">
            {releases.map((r) => (
              <Link
                key={r.id}
                href={`/dashboard/releases/${r.id}`}
                className="flex items-center justify-between gap-4 py-3 hover:bg-paper"
              >
                <div className="min-w-0">
                  <p className="font-mono text-sm text-ink">
                    {r.gitSha.slice(0, 7)}
                    <span className="ml-2 font-sans text-[12px] uppercase tracking-wide text-ink-faint">
                      {r.trigger}
                    </span>
                  </p>
                  <p className="truncate text-[12px] text-ink-faint">
                    {r.commitMessage ?? ", "}
                    {r.commitAuthor ? ` · ${r.commitAuthor}` : ""}
                  </p>
                </div>
                <StatusBadge status={r.status} />
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* ── Environment variables ───────────────────────────────────────── */}
      <Card title="Environment variables">
        <p className="mb-4 text-sm text-ink-faint">
          Stored encrypted (AES-256-GCM), injected into the function&apos;s configuration on
          every deploy. Values are never shown again after saving.
        </p>
        {varNote && <Alert tone="info">{varNote}</Alert>}
        {varPost.error && <Alert tone="error">{varPost.error}</Alert>}

        {vars === null ? (
          <p className="py-3 font-mono text-sm text-ink-faint">loading…</p>
        ) : vars.length === 0 ? (
          <p className="py-2 text-sm text-ink-faint">None yet.</p>
        ) : (
          <div className="divide-y divide-line">
            {vars.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-4 py-2.5">
                <div className="min-w-0">
                  <p className="font-mono text-[13px] text-ink">{v.key}</p>
                  <p className="font-mono text-[12px] text-ink-faint">{v.valueMasked}</p>
                </div>
                <button
                  className="font-mono text-[11px] uppercase tracking-wide text-red-700 hover:underline"
                  onClick={() => deleteVar(v.key)}
                >
                  delete
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-[1fr_1fr_auto]">
          <Field label="Key" error={varPost.fieldErrors.key}>
            <Input
              placeholder="STRIPE_SECRET_KEY"
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value.trim() })}
            />
          </Field>
          <Field label="Value" error={varPost.fieldErrors.value}>
            <Input
              type="password"
              placeholder="value (hidden after save)"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
            />
          </Field>
          <div className="flex items-end">
            <Button onClick={addVar} disabled={varPost.busy || !form.key || !form.value}>
              {varPost.busy ? "Saving…" : "Add"}
            </Button>
          </div>
        </div>
      </Card>
    </>
  );
}
