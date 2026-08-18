"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Field, Input, Kicker, Select } from "@/components/ui";
import { usePost } from "@/components/useForm";
import { SUPPORTED_REGIONS } from "@/lib/regions";

type Connection = { awsAccountId: string; roleArn: string; defaultRegion: string } | null;

function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-[4px] border border-console-line bg-console px-3 py-2.5">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-console-dim">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <code className="truncate font-mono text-[13px] text-console-green">{value}</code>
        <button
          type="button"
          className="shrink-0 font-mono text-[11px] uppercase tracking-wide text-slate-400 hover:text-paper"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard unavailable */
            }
          }}
        >
          {copied ? "copied ✓" : "copy"}
        </button>
      </div>
    </div>
  );
}

export default function ProvisionClient({
  externalId,
  platformAccountId,
  provisionerMode,
  orgActive,
  connection: initialConnection,
}: {
  externalId: string;
  platformAccountId: string;
  provisionerMode: "mock" | "live";
  orgActive: boolean;
  connection: Connection;
}) {
  const router = useRouter();
  const [connection, setConnection] = useState<Connection>(initialConnection);
  const [editingConnection, setEditingConnection] = useState(!initialConnection);

  // ── preflight (test connection) ─────────────────────────────────────────
  const preflight = usePost();
  const [preflightResult, setPreflightResult] = useState<{ ok: boolean; message: string } | null>(
    null
  );
  async function runPreflight() {
    setPreflightResult(null);
    const res = await preflight.post<{ ok: boolean; message?: string }>("/api/aws/preflight", {});
    if (res) {
      setPreflightResult({ ok: res.ok, message: res.message ?? "Connection looks good." });
    } else {
      setPreflightResult({ ok: false, message: preflight.error ?? "Test failed." });
    }
  }

  // ── connection form state ──────────────────────────────────────────────
  const conn = usePost();
  const [connForm, setConnForm] = useState({
    awsAccountId: initialConnection?.awsAccountId ?? "",
    roleArn: initialConnection?.roleArn ?? "",
    defaultRegion: initialConnection?.defaultRegion ?? "us-east-1",
  });

  async function saveConnection() {
    const res = await conn.post<{ ok: true }>("/api/aws/connection", connForm);
    if (!res) return;
    setConnection({ ...connForm });
    setEditingConnection(false);
  }

  // ── provision form state ───────────────────────────────────────────────
  const prov = usePost();
  const [form, setForm] = useState({
    projectName: "",
    environment: "staging" as "staging" | "production",
    region: initialConnection?.defaultRegion ?? "us-east-1",
    billingModel: "subscription" as "subscription" | "usage",
    enableUsageBilling: false,
    cognitoCallbackUrl: "http://localhost:3000/auth/callback",
  });

  async function startProvisioning() {
    const res = await prov.post<{ ok: true; deploymentId: string }>("/api/provision", {
      ...form,
      enableUsageBilling: form.billingModel === "usage" || form.enableUsageBilling,
      authProviders: ["email"],
    });
    if (res) router.push(`/dashboard/environments/${res.deploymentId}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <Kicker>Provision</Kicker>
        <h1 className="display-wide font-display text-2xl font-bold text-ink">
          New environment
        </h1>
      </div>

      {provisionerMode === "mock" && (
        <Alert tone="info">
          <strong>Simulation mode is on</strong> (PROVISIONER_MODE=mock). Runs execute the
          full pipeline against a realistic simulator, nothing touches AWS. Set
          PROVISIONER_MODE=live with platform AWS credentials to provision real stacks.
        </Alert>
      )}
      {!orgActive && (
        <Alert tone="warn">
          Provisioning is locked until a plan or approved trial is active.{" "}
          <Link href="/pricing" className="font-medium underline underline-offset-4">See plans</Link>
        </Alert>
      )}

      {/* ── Step 1: AWS connection ──────────────────────────────────────── */}
      <Card
        title="Step 1, Connect your AWS account"
        action={
          connection && !editingConnection ? (
            <button
              className="text-sm text-ink-soft underline underline-offset-4"
              onClick={() => setEditingConnection(true)}
            >
              Edit
            </button>
          ) : null
        }
      >
        {connection && !editingConnection ? (
          <div className="space-y-3 text-sm">
            <p className="text-ink-soft">
              <span className="font-mono text-[12px] uppercase tracking-wide text-ink-faint">account </span>
              <span className="font-mono">{connection.awsAccountId}</span>
            </p>
            <p className="truncate text-ink-soft">
              <span className="font-mono text-[12px] uppercase tracking-wide text-ink-faint">role </span>
              <span className="font-mono">{connection.roleArn}</span>
            </p>
            <div className="flex items-center gap-3">
              <Button
                variant="ink"
                className="px-3.5 py-1.5 text-xs"
                disabled={preflight.busy}
                onClick={runPreflight}
              >
                {preflight.busy ? "Testing…" : "Test AWS connection"}
              </Button>
              {preflightResult && (
                <span
                  className={
                    preflightResult.ok
                      ? "text-[13px] text-emerald-700"
                      : "text-[13px] text-red-700"
                  }
                >
                  {preflightResult.ok ? "✓ " : "✗ "}
                  {preflightResult.message}
                </span>
              )}
            </div>
            <p className="text-ink-faint">
              This runs a real assume-role and template check in live mode, a fast way to
              catch a bad trust policy or External ID before a full run.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-ink-soft">
              <li>
                Download the connector role template:{" "}
                <a href="/connector-role.yaml" className="font-medium underline underline-offset-4" download>
                  connector-role.yaml
                </a>
              </li>
              <li>
                In <em>your</em> AWS account, open CloudFormation → Create stack → “Upload a
                template file”, choose the file, and fill the two parameters with the values
                below. Or via CLI:
                <pre className="mt-2 overflow-x-auto rounded-[4px] bg-console p-3 font-mono text-[12px] leading-relaxed text-console-green">
{`aws cloudformation deploy \\
  --template-file connector-role.yaml \\
  --stack-name diab-connector-role \\
  --capabilities CAPABILITY_NAMED_IAM \\
  --parameter-overrides \\
    PlatformAccountId=${platformAccountId} \\
    ExternalId=${externalId}`}
                </pre>
              </li>
              <li>
                When the stack finishes, copy the <code className="font-mono">RoleArn</code>{" "}
                output and paste it here with your 12-digit account ID.
              </li>
            </ol>

            <div className="grid gap-3 sm:grid-cols-2">
              <CopyValue label="PlatformAccountId" value={platformAccountId} />
              <CopyValue label="ExternalId (unique to your org)" value={externalId} />
            </div>

            {conn.error && <Alert tone="error">{conn.error}</Alert>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="AWS account ID" hint="12 digits" error={conn.fieldErrors.awsAccountId}>
                <Input
                  inputMode="numeric"
                  placeholder="123456789012"
                  value={connForm.awsAccountId}
                  onChange={(e) => setConnForm({ ...connForm, awsAccountId: e.target.value.trim() })}
                />
              </Field>
              <Field label="Default region" error={conn.fieldErrors.defaultRegion}>
                <Select
                  value={connForm.defaultRegion}
                  onChange={(e) => setConnForm({ ...connForm, defaultRegion: e.target.value })}
                >
                  {SUPPORTED_REGIONS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.id}, {r.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field
              label="Connector role ARN"
              hint="From the stack's outputs tab"
              error={conn.fieldErrors.roleArn}
            >
              <Input
                placeholder="arn:aws:iam::123456789012:role/DeployInABoxProvisioner"
                value={connForm.roleArn}
                onChange={(e) => setConnForm({ ...connForm, roleArn: e.target.value.trim() })}
              />
            </Field>
            <Button onClick={saveConnection} disabled={conn.busy}>
              {conn.busy ? "Saving…" : "Save connection"}
            </Button>
          </div>
        )}
      </Card>

      {/* ── Step 2: configure ───────────────────────────────────────────── */}
      <Card title="Step 2, Configure & provision">
        {!connection ? (
          <p className="text-sm text-ink-faint">Connect your AWS account first.</p>
        ) : (
          <div className="space-y-5">
            {prov.error && <Alert tone="error">{prov.error}</Alert>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Project name"
                hint="Lowercase letters, digits, hyphens · becomes diab-<name>-<env>"
                error={prov.fieldErrors.projectName}
              >
                <Input
                  placeholder="acme-crm"
                  value={form.projectName}
                  onChange={(e) => setForm({ ...form, projectName: e.target.value.trim().toLowerCase() })}
                />
              </Field>
              <Field label="Environment" error={prov.fieldErrors.environment}>
                <Select
                  value={form.environment}
                  onChange={(e) => setForm({ ...form, environment: e.target.value as "staging" | "production" })}
                >
                  <option value="staging">staging</option>
                  <option value="production">production</option>
                </Select>
              </Field>
              <Field label="AWS region" error={prov.fieldErrors.region}>
                <Select value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}>
                  {SUPPORTED_REGIONS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.id}, {r.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Billing model" hint="How your SaaS will charge its customers" error={prov.fieldErrors.billingModel}>
                <Select
                  value={form.billingModel}
                  onChange={(e) => setForm({ ...form, billingModel: e.target.value as "subscription" | "usage" })}
                >
                  <option value="subscription">Subscription plans (Stripe)</option>
                  <option value="usage">Usage-based (adds metering pipeline)</option>
                </Select>
              </Field>
            </div>
            <Field
              label="Auth callback URL"
              hint="Where your frontend receives Cognito redirects, change it later in Cognito if needed"
              error={prov.fieldErrors.cognitoCallbackUrl}
            >
              <Input
                value={form.cognitoCallbackUrl}
                onChange={(e) => setForm({ ...form, cognitoCallbackUrl: e.target.value.trim() })}
              />
            </Field>

            <div className="rounded-[4px] border border-line bg-paper px-4 py-3 font-mono text-[12px] leading-relaxed text-ink-soft">
              <p className="text-[10px] uppercase tracking-[0.16em] text-ink-faint">Will be created</p>
              <p className="mt-1">
                stack <span className="text-cargo">diab-{form.projectName || "<project>"}-{form.environment}</span> in{" "}
                {form.region}, DynamoDB ×{form.billingModel === "usage" ? 3 : 2}, Cognito pool + client,
                Lambda API + HTTP API (JWT), S3 + CloudFront
              </p>
            </div>

            <div className="rounded-[4px] border border-line bg-white px-4 py-3 text-[13px] leading-relaxed text-ink-soft">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                What happens when you click provision
              </p>
              <p className="mt-1">
                We assume the role you created (using your unique External ID), launch one
                CloudFormation stack in your account, and stream every event into a live log
                on the next page. Takes 5 to 10 minutes. If anything fails, AWS rolls the
                stack back automatically and the log tells you exactly why. You can delete
                the stack from your own CloudFormation console at any time.
              </p>
            </div>

            <Button
              onClick={startProvisioning}
              disabled={prov.busy || !orgActive}
              className="px-6 py-3"
            >
              {prov.busy ? "Queuing run…" : "Provision environment →"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
