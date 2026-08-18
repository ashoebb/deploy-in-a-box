"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Alert, Card, Kicker, StatusBadge } from "@/components/ui";
import EnvOpsPanel, { type ReleaseRow } from "./EnvOpsPanel";
import ObservabilityPanel from "./ObservabilityPanel";
import DataStudioPanel from "./DataStudioPanel";

type Deployment = {
  id: string;
  projectName: string;
  environment: string;
  region: string;
  stackName: string;
  status: "queued" | "validating" | "provisioning" | "completed" | "failed";
  kind?: "persistent" | "preview";
  currentSha?: string | null;
  gitBranch?: string | null;
  errorMessage: string | null;
  outputs: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
};

type LogLine = { id: string; level: "info" | "warn" | "error" | "success"; message: string; createdAt: string };

const ACTIVE: Deployment["status"][] = ["queued", "validating", "provisioning"];

const OUTPUT_LABELS: Record<string, string> = {
  Region: "Region",
  UserPoolId: "Cognito user pool ID",
  UserPoolClientId: "Cognito app client ID",
  ApiEndpoint: "API endpoint",
  DataTableName: "DynamoDB data table",
  TenantsTableName: "DynamoDB tenants table",
  UsageEventsTableName: "DynamoDB usage events table",
  AssetsBucketName: "Assets bucket (S3)",
  CdnDomainName: "CDN domain (CloudFront)",
};

export default function EnvironmentClient({ id }: { id: string }) {
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [releases, setReleases] = useState<ReleaseRow[]>([]);
  const [notFound, setNotFound] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const load = useCallback(async () => {
    const res = await fetch(`/api/deployments/${id}`, { cache: "no-store" });
    if (res.status === 404) {
      setNotFound(true);
      return null;
    }
    if (!res.ok) return null;
    const data = (await res.json()) as {
      deployment: Deployment;
      logs: LogLine[];
      releases?: ReleaseRow[];
    };
    setDeployment(data.deployment);
    setLogs(data.logs);
    setReleases(data.releases ?? []);
    return data.deployment;
  }, [id]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    async function loop() {
      const dep = await load();
      if (stopped) return;
      if (!dep || ACTIVE.includes(dep.status)) {
        timer = setTimeout(loop, 5000);
      }
    }
    loop();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [load]);

  useEffect(() => {
    if (stickToBottom.current) {
      logEndRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [logs.length]);

  if (notFound) {
    return (
      <Alert tone="error">
        This environment doesn&apos;t exist or belongs to a different organization.{" "}
        <Link href="/dashboard" className="font-medium underline underline-offset-4">Back to overview</Link>
      </Alert>
    );
  }
  if (!deployment) {
    return <p className="py-10 text-center font-mono text-sm text-ink-faint">loading run…</p>;
  }

  const isActive = ACTIVE.includes(deployment.status);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Kicker>Environment</Kicker>
          <h1 className="display-wide font-display text-2xl font-bold text-ink">
            {deployment.stackName}
          </h1>
          <p className="mt-1 font-mono text-[12px] text-ink-faint">
            {deployment.region} · run {deployment.id}
            {deployment.currentSha ? ` · live @ ${deployment.currentSha.slice(0, 7)}` : ""}
            {deployment.kind === "preview" ? " · preview" : ""}
          </p>
        </div>
        <StatusBadge status={deployment.status} />
      </div>

      {deployment.status === "failed" && deployment.errorMessage && (
        <Alert tone="error">
          <strong>Run failed:</strong> {deployment.errorMessage}
        </Alert>
      )}
      {deployment.status === "completed" && (
        <Alert tone="success">
          Environment live. Access details below, they&apos;re also permanently available on
          this page.
        </Alert>
      )}

      {/* ── Outputs ─────────────────────────────────────────────────────── */}
      {deployment.outputs && Object.keys(deployment.outputs).length > 0 && (
        <Card title="Environment access details">
          <dl className="divide-y divide-line">
            {Object.entries(deployment.outputs).map(([key, value]) => (
              <div key={key} className="grid gap-1 py-2.5 sm:grid-cols-[240px_1fr] sm:gap-4">
                <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-faint sm:pt-0.5">
                  {OUTPUT_LABELS[key] ?? key}
                </dt>
                <dd className="break-all font-mono text-[13px] text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {/* ── Day-2 ops: releases & env vars (once provisioned) ───────────── */}
      {deployment.status === "completed" && (
        <>
          <EnvOpsPanel environmentId={deployment.id} releases={releases} />
          <ObservabilityPanel environmentId={deployment.id} />
          <DataStudioPanel environmentId={deployment.id} />
        </>
      )}

      {/* ── Live log ────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-[6px] border border-console-line">
        <div className="flex items-center justify-between border-b border-console-line bg-console px-4 py-2.5">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-console-dim">
            provisioning log {isActive && <span className="text-console-green">· live</span>}
          </p>
          {isActive && (
            <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-console-green" />
          )}
        </div>
        <div
          className="max-h-[420px] overflow-y-auto bg-console px-4 py-3"
          onScroll={(e) => {
            const el = e.currentTarget;
            stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          }}
        >
          {logs.length === 0 ? (
            <p className="font-mono text-[13px] text-console-dim">waiting for worker…</p>
          ) : (
            logs.map((line) => (
              <p key={line.id} className="font-mono text-[13px] leading-relaxed">
                <span className="text-console-dim">
                  {new Date(line.createdAt).toISOString().slice(11, 19)}{" "}
                </span>
                <span
                  className={
                    line.level === "error"
                      ? "text-red-400"
                      : line.level === "warn"
                        ? "text-amber-300"
                        : "text-console-green"
                  }
                >
                  {line.message}
                </span>
              </p>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>

      <p className="text-sm text-ink-faint">
        Every action above also appears in your AWS CloudTrail under the session name{" "}
        <code className="font-mono">diab-provisioner</code>. Questions about a line?{" "}
        <Link href="/dashboard/support" className="underline underline-offset-4">Support</Link> can read this
        exact log with you.
      </p>
    </div>
  );
}
