"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Card, Field, Input, Kicker } from "@/components/ui";
import { usePost } from "@/components/useForm";

type Conn = {
  repoFullName: string;
  defaultBranch: string;
  previewsEnabled: boolean;
  webhookSecret: string;
  installationId: string | null;
} | null;

export default function GitClient() {
  const [conn, setConn] = useState<Conn>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [mode, setMode] = useState<"live" | "mock">("mock");
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const { post, busy, error, fieldErrors } = usePost();
  const [form, setForm] = useState({ repoFullName: "", defaultBranch: "main", previewsEnabled: false });

  useEffect(() => {
    fetch("/api/git/connection", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setConn(d.connection);
        setWebhookUrl(d.webhookUrl);
        setMode(d.gitMode);
        if (d.connection) {
          setForm({
            repoFullName: d.connection.repoFullName,
            defaultBranch: d.connection.defaultBranch,
            previewsEnabled: d.connection.previewsEnabled,
          });
        }
        setLoaded(true);
      });
  }, []);

  async function save() {
    setSaved(false);
    const res = await post<{ ok: true; webhookSecret: string }>("/api/git/connection", form);
    if (res) {
      setConn({ ...form, webhookSecret: res.webhookSecret, installationId: conn?.installationId ?? null });
      setSaved(true);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Kicker>Git &amp; CI/CD</Kicker>
        <h1 className="display-wide font-display text-2xl font-bold text-ink">
          Continuous deployment
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-faint">
          Connect a repository and every push to your tracked branch deploys to your
          environments automatically. Open a pull request to get an ephemeral preview
          environment; it&apos;s torn down when the PR closes.
        </p>
      </div>

      {mode === "mock" && (
        <Alert tone="info">
          <strong>Git simulation mode.</strong> No GitHub App credentials are configured on the
          platform, so deploys simulate the pipeline end-to-end. Webhook signature
          verification and the release state machine are fully real.
        </Alert>
      )}

      {!loaded ? (
        <p className="py-8 text-center font-mono text-sm text-ink-faint">loading…</p>
      ) : (
        <>
          <Card title="Repository">
            <div className="space-y-4">
              {error && <Alert tone="error">{error}</Alert>}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Repository" hint="owner/repo on GitHub" error={fieldErrors.repoFullName}>
                  <Input
                    placeholder="nilelabs/crm-api"
                    value={form.repoFullName}
                    onChange={(e) => setForm({ ...form, repoFullName: e.target.value.trim() })}
                  />
                </Field>
                <Field label="Deploy branch" hint="Pushes here deploy to your environments" error={fieldErrors.defaultBranch}>
                  <Input
                    value={form.defaultBranch}
                    onChange={(e) => setForm({ ...form, defaultBranch: e.target.value.trim() })}
                  />
                </Field>
              </div>
              <label className="flex items-center gap-2.5 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  checked={form.previewsEnabled}
                  onChange={(e) => setForm({ ...form, previewsEnabled: e.target.checked })}
                  className="h-4 w-4 accent-cargo"
                />
                Provision an ephemeral preview environment for every open pull request
              </label>
              <div className="flex items-center gap-3">
                <Button onClick={save} disabled={busy}>
                  {busy ? "Saving…" : conn ? "Save changes" : "Connect repository"}
                </Button>
                {saved && <span className="text-sm text-emerald-700">Saved ✓</span>}
              </div>
            </div>
          </Card>

          {conn && (
            <Card title="Webhook, add this to your repository">
              <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-ink-soft">
                <li>
                  On GitHub: your repo → <em>Settings → Webhooks → Add webhook</em>.
                </li>
                <li>
                  <span className="font-mono text-[12px] uppercase tracking-wide text-ink-faint">Payload URL </span>
                  <code className="break-all font-mono text-[13px] text-ink">{webhookUrl}</code>
                </li>
                <li>
                  <span className="font-mono text-[12px] uppercase tracking-wide text-ink-faint">Content type </span>
                  <code className="font-mono text-[13px] text-ink">application/json</code>
                </li>
                <li>
                  <span className="font-mono text-[12px] uppercase tracking-wide text-ink-faint">Secret </span>
                  <code className="break-all font-mono text-[13px] text-ink">{conn.webhookSecret}</code>
                </li>
                <li>
                  Events: select <em>Let me select individual events</em> → check{" "}
                  <strong>Pushes</strong> and <strong>Pull requests</strong>.
                </li>
              </ol>
              <p className="mt-4 text-sm text-ink-faint">
                Every delivery is HMAC-verified against this secret and deduplicated by
                GitHub&apos;s delivery id, retries can&apos;t double-deploy.
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
