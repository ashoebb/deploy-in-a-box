"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Card, Input, Select } from "@/components/ui";

type LogEvent = { id: string; timestamp: number; message: string; isError: boolean };
type Series = {
  id: string;
  label: string;
  unit: string;
  timestamps: number[];
  values: number[];
  total: number;
};

const LOG_RANGES = [
  { id: "15m", label: "Last 15 min", ms: 15 * 60 * 1000 },
  { id: "1h", label: "Last hour", ms: 60 * 60 * 1000 },
  { id: "6h", label: "Last 6 hours", ms: 6 * 60 * 60 * 1000 },
  { id: "24h", label: "Last 24 hours", ms: 24 * 60 * 60 * 1000 },
];
const METRIC_RANGES = ["1h", "6h", "24h", "7d"] as const;

/** Logs + metrics for a provisioned environment, no AWS Console required. */
export default function ObservabilityPanel({ environmentId }: { environmentId: string }) {
  const [tab, setTab] = useState<"logs" | "metrics">("logs");

  return (
    <Card
      title="Observability"
      action={
        <div className="flex gap-1">
          {(["logs", "metrics"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-[3px] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] ${
                tab === t ? "bg-ink text-paper" : "text-ink-faint hover:text-ink"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      }
    >
      {tab === "logs" ? (
        <LogsTab environmentId={environmentId} />
      ) : (
        <MetricsTab environmentId={environmentId} />
      )}
    </Card>
  );
}

// ── Logs ─────────────────────────────────────────────────────────────────────

function LogsTab({ environmentId }: { environmentId: string }) {
  const [rangeId, setRangeId] = useState("1h");
  const [q, setQ] = useState("");
  const [events, setEvents] = useState<LogEvent[] | null>(null);
  const [logGroup, setLogGroup] = useState("");
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (append = false, token?: string) => {
      setBusy(true);
      setError(null);
      const range = LOG_RANGES.find((r) => r.id === rangeId) ?? LOG_RANGES[1];
      const end = Date.now();
      const params = new URLSearchParams({
        start: String(end - range.ms),
        end: String(end),
      });
      if (q.trim()) params.set("q", q.trim());
      if (token) params.set("token", token);
      const res = await fetch(`/api/environments/${environmentId}/logs?${params}`, {
        cache: "no-store",
      });
      setBusy(false);
      if (!res.ok) {
        setError(((await res.json()) as { error?: string }).error ?? "Couldn't fetch logs.");
        return;
      }
      const data = (await res.json()) as {
        events: LogEvent[];
        nextToken: string | null;
        logGroup: string;
      };
      setLogGroup(data.logGroup);
      setNextToken(data.nextToken);
      setEvents((prev) => (append && prev ? [...prev, ...data.events] : data.events));
    },
    [environmentId, rangeId, q]
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => load(), 5000);
    return () => clearInterval(t);
  }, [auto, load]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={rangeId} onChange={(e) => setRangeId(e.target.value)} className="w-40">
          {LOG_RANGES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </Select>
        <Input
          placeholder="filter (e.g. ERROR, /items, tenant)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          className="max-w-xs"
        />
        <Button variant="ink" className="px-3.5 py-1.5 text-xs" onClick={() => load()} disabled={busy}>
          {busy ? "Fetching…" : "Refresh"}
        </Button>
        <label className="flex items-center gap-2 text-[12px] text-ink-faint">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
            className="h-3.5 w-3.5 accent-cargo"
          />
          auto-refresh 5s
        </label>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="overflow-hidden rounded-[6px] border border-console-line">
        <div className="border-b border-console-line bg-console px-4 py-2">
          <p className="truncate font-mono text-[11px] uppercase tracking-[0.14em] text-console-dim">
            {logGroup || "…"}
          </p>
        </div>
        <div className="max-h-[380px] overflow-y-auto bg-console px-4 py-3">
          {events === null ? (
            <p className="font-mono text-[13px] text-console-dim">fetching logs…</p>
          ) : events.length === 0 ? (
            <p className="font-mono text-[13px] text-console-dim">
              no log events in this window{q ? " matching your filter" : ""}
            </p>
          ) : (
            events.map((e) => (
              <p key={e.id} className="font-mono text-[12.5px] leading-relaxed">
                <span className="text-console-dim">
                  {new Date(e.timestamp).toISOString().slice(11, 19)}{" "}
                </span>
                <span className={e.isError ? "text-red-400" : "text-slate-200"}>{e.message}</span>
              </p>
            ))
          )}
          {nextToken && (
            <button
              className="mt-2 font-mono text-[12px] text-console-green underline underline-offset-4"
              onClick={() => load(true, nextToken)}
              disabled={busy}
            >
              load more ↓
            </button>
          )}
          <div ref={endRef} />
        </div>
      </div>
      <p className="text-[12px] text-ink-faint">
        Fetched live from CloudWatch in your account, we store nothing. History follows your
        CloudWatch retention settings.
      </p>
    </div>
  );
}

// ── Metrics ──────────────────────────────────────────────────────────────────

function MetricsTab({ environmentId }: { environmentId: string }) {
  const [range, setRange] = useState<(typeof METRIC_RANGES)[number]>("1h");
  const [series, setSeries] = useState<Series[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/environments/${environmentId}/metrics?range=${range}`, {
      cache: "no-store",
    });
    setBusy(false);
    if (!res.ok) {
      setError(((await res.json()) as { error?: string }).error ?? "Couldn't fetch metrics.");
      return;
    }
    setSeries(((await res.json()) as { series: Series[] }).series);
  }, [environmentId, range]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex gap-1">
          {METRIC_RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-[3px] px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide ${
                range === r ? "bg-ink text-paper" : "text-ink-faint hover:text-ink"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <Button variant="ink" className="px-3.5 py-1.5 text-xs" onClick={load} disabled={busy}>
          {busy ? "Fetching…" : "Refresh"}
        </Button>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {series === null ? (
        <p className="py-6 text-center font-mono text-sm text-ink-faint">fetching metrics…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {series.map((s) => (
            <div key={s.id} className="rounded-[6px] border border-line bg-paper p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                {s.label}
              </p>
              <p className="mt-1 display-wide font-display text-2xl font-bold text-ink">
                {formatTotal(s)}
                <span className="ml-1.5 text-xs font-normal text-ink-faint">
                  {s.id === "p95" ? "ms max" : s.unit}
                </span>
              </p>
              <Sparkline
                values={s.values}
                stroke={s.id === "errors" && s.total > 0 ? "#DC2626" : "#E8590C"}
              />
            </div>
          ))}
        </div>
      )}
      <p className="text-[12px] text-ink-faint">
        CloudWatch GetMetricData from your account: Lambda invocations, errors, and p95
        duration for the API function, plus consumed capacity on the data table.
      </p>
    </div>
  );
}

function formatTotal(s: Series): string {
  if (s.total >= 10000) return `${(s.total / 1000).toFixed(1)}k`;
  return String(Math.round(s.total));
}

function Sparkline({ values, stroke }: { values: number[]; stroke: string }) {
  const W = 220;
  const H = 44;
  if (values.length < 2) {
    return <div className="mt-2 h-[44px] rounded bg-ink/5" aria-hidden />;
  }
  const max = Math.max(...values, 1);
  const pts = values
    .map(
      (v, i) =>
        `${((i / (values.length - 1)) * W).toFixed(1)},${(H - 3 - (v / max) * (H - 8)).toFixed(1)}`
    )
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mt-2 h-[44px] w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.5" />
    </svg>
  );
}
