import {
  CloudWatchLogsClient,
  FilterLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { CloudWatchClient, GetMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import type { AssumedCredentials } from "./aws";

/**
 * Day-2 observability, fetched ON DEMAND from the customer's account via the
 * connector role, nothing is stored in the control plane. History equals the
 * customer's CloudWatch retention, and the UI says so.
 *
 * PROVISIONER_MODE=mock serves deterministic simulated data (seeded per
 * environment+bucket) so the whole surface is demoable with zero AWS calls.
 */

export interface LogEvent {
  id: string;
  timestamp: number;
  message: string;
  isError: boolean;
}

export interface LogsPage {
  events: LogEvent[];
  nextToken: string | null;
  logGroup: string;
}

export interface MetricSeries {
  id: "invocations" | "errors" | "p95" | "dynamoReads" | "dynamoWrites";
  label: string;
  unit: string;
  timestamps: number[]; // ms epoch, ascending
  values: number[];
  total: number; // sum for counts, max for p95
}

// ── Live fetchers ────────────────────────────────────────────────────────────

export async function fetchLiveLogs(opts: {
  region: string;
  creds: AssumedCredentials;
  stackName: string;
  startMs: number;
  endMs: number;
  filter?: string;
  nextToken?: string;
  limit?: number;
}): Promise<LogsPage> {
  const client = new CloudWatchLogsClient({
    region: opts.region,
    credentials: {
      accessKeyId: opts.creds.accessKeyId,
      secretAccessKey: opts.creds.secretAccessKey,
      sessionToken: opts.creds.sessionToken,
    },
  });
  const logGroup = `/aws/lambda/${opts.stackName}-api`;
  const res = await client.send(
    new FilterLogEventsCommand({
      logGroupName: logGroup,
      startTime: opts.startMs,
      endTime: opts.endMs,
      filterPattern: opts.filter || undefined,
      nextToken: opts.nextToken || undefined,
      limit: Math.min(opts.limit ?? 100, 500),
    })
  );
  return {
    logGroup,
    nextToken: res.nextToken ?? null,
    events: (res.events ?? []).map((e, i) => ({
      id: e.eventId ?? `${e.timestamp}-${i}`,
      timestamp: e.timestamp ?? 0,
      message: (e.message ?? "").trimEnd(),
      isError: /\b(ERROR|Exception|Task timed out|errorMessage)\b/i.test(e.message ?? ""),
    })),
  };
}

export async function fetchLiveMetrics(opts: {
  region: string;
  creds: AssumedCredentials;
  stackName: string;
  dataTableName: string;
  startMs: number;
  endMs: number;
  periodSec: number;
}): Promise<MetricSeries[]> {
  const client = new CloudWatchClient({
    region: opts.region,
    credentials: {
      accessKeyId: opts.creds.accessKeyId,
      secretAccessKey: opts.creds.secretAccessKey,
      sessionToken: opts.creds.sessionToken,
    },
  });
  const fn = `${opts.stackName}-api`;
  const res = await client.send(
    new GetMetricDataCommand({
      StartTime: new Date(opts.startMs),
      EndTime: new Date(opts.endMs),
      ScanBy: "TimestampAscending",
      MetricDataQueries: [
        q("invocations", "AWS/Lambda", "Invocations", "Sum", opts.periodSec, [
          { Name: "FunctionName", Value: fn },
        ]),
        q("errors", "AWS/Lambda", "Errors", "Sum", opts.periodSec, [
          { Name: "FunctionName", Value: fn },
        ]),
        q("p95", "AWS/Lambda", "Duration", "p95", opts.periodSec, [
          { Name: "FunctionName", Value: fn },
        ]),
        q("dynamoReads", "AWS/DynamoDB", "ConsumedReadCapacityUnits", "Sum", opts.periodSec, [
          { Name: "TableName", Value: opts.dataTableName },
        ]),
        q("dynamoWrites", "AWS/DynamoDB", "ConsumedWriteCapacityUnits", "Sum", opts.periodSec, [
          { Name: "TableName", Value: opts.dataTableName },
        ]),
      ],
    })
  );

  const byId = new Map(
    (res.MetricDataResults ?? []).map((r) => [
      r.Id!,
      {
        timestamps: (r.Timestamps ?? []).map((t) => t.getTime()),
        values: r.Values ?? [],
      },
    ])
  );
  return SERIES_DEFS.map((def) => {
    const data = byId.get(def.id) ?? { timestamps: [], values: [] };
    const total =
      def.id === "p95"
        ? Math.max(0, ...data.values)
        : data.values.reduce((a, b) => a + b, 0);
    return { ...def, timestamps: data.timestamps, values: data.values, total };
  });
}

function q(
  id: string,
  namespace: string,
  metric: string,
  stat: string,
  period: number,
  dims: { Name: string; Value: string }[]
) {
  return {
    Id: id,
    MetricStat: {
      Metric: { Namespace: namespace, MetricName: metric, Dimensions: dims },
      Period: period,
      Stat: stat,
    },
  };
}

const SERIES_DEFS: Omit<MetricSeries, "timestamps" | "values" | "total">[] = [
  { id: "invocations", label: "Invocations", unit: "count" },
  { id: "errors", label: "Errors", unit: "count" },
  { id: "p95", label: "Duration p95", unit: "ms" },
  { id: "dynamoReads", label: "DynamoDB reads", unit: "RCU" },
  { id: "dynamoWrites", label: "DynamoDB writes", unit: "WCU" },
];

// ── Mock generators (deterministic per env + time bucket) ────────────────────

function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const MOCK_PATHS = ["/health", "/me", "/items", "/items", "/items/i_204", "/me"];

export function mockLogs(opts: {
  envId: string;
  stackName: string;
  startMs: number;
  endMs: number;
  filter?: string;
}): LogsPage {
  const rand = seeded(`${opts.envId}:${Math.floor(opts.startMs / 60000)}`);
  const events: LogEvent[] = [];
  const span = opts.endMs - opts.startMs;
  const count = Math.min(80, Math.max(12, Math.floor(span / 45000)));
  for (let i = 0; i < count; i++) {
    const t = opts.startMs + Math.floor((i / count) * span + rand() * 20000);
    const path = MOCK_PATHS[Math.floor(rand() * MOCK_PATHS.length)];
    const ms = (30 + rand() * 320).toFixed(1);
    const isError = rand() < 0.06;
    const reqId = `${Math.floor(rand() * 1e8).toString(16)}-mock`;
    events.push(
      {
        id: `${t}-s`,
        timestamp: t,
        message: `START RequestId: ${reqId} Version: $LATEST`,
        isError: false,
      },
      isError
        ? {
            id: `${t}-e`,
            timestamp: t + 8,
            message: `ERROR Invoke Error {"errorType":"TenantNotFound","errorMessage":"tenant t_${Math.floor(rand() * 90 + 10)} not in tenants table","path":"${path}"}`,
            isError: true,
          }
        : {
            id: `${t}-r`,
            timestamp: t + 8,
            message: `[tenant t_${Math.floor(rand() * 90 + 10)}] ${path} 200 ${ms}ms`,
            isError: false,
          },
      {
        id: `${t}-x`,
        timestamp: t + 12,
        message: `REPORT RequestId: ${reqId}\tDuration: ${ms} ms\tBilled Duration: ${Math.ceil(Number(ms))} ms\tMemory Size: 256 MB\tMax Memory Used: ${Math.floor(70 + rand() * 60)} MB`,
        isError: false,
      }
    );
  }
  let out = events.sort((a, b) => a.timestamp - b.timestamp);
  if (opts.filter) {
    const f = opts.filter.toLowerCase();
    out = out.filter((e) => e.message.toLowerCase().includes(f));
  }
  return {
    logGroup: `/aws/lambda/${opts.stackName}-api (simulated)`,
    nextToken: null,
    events: out,
  };
}

export function mockMetrics(opts: {
  envId: string;
  startMs: number;
  endMs: number;
  periodSec: number;
}): MetricSeries[] {
  const buckets = Math.max(2, Math.floor((opts.endMs - opts.startMs) / (opts.periodSec * 1000)));
  const timestamps = Array.from(
    { length: buckets },
    (_, i) => opts.startMs + i * opts.periodSec * 1000
  );
  const rand = seeded(`${opts.envId}:m:${Math.floor(opts.startMs / 300000)}`);
  const inv = timestamps.map(() => Math.floor(8 + rand() * 60));
  const errs = inv.map((v) => (rand() < 0.35 ? Math.floor(v * rand() * 0.08) : 0));
  const p95 = timestamps.map(() => Math.floor(90 + rand() * 240));
  const reads = inv.map((v) => Math.floor(v * (1.2 + rand())));
  const writes = inv.map((v) => Math.floor(v * (0.3 + rand() * 0.4)));
  const mk = (
    id: MetricSeries["id"],
    label: string,
    unit: string,
    values: number[],
    isP95 = false
  ): MetricSeries => ({
    id,
    label,
    unit,
    timestamps,
    values,
    total: isP95 ? Math.max(...values) : values.reduce((a, b) => a + b, 0),
  });
  return [
    mk("invocations", "Invocations", "count", inv),
    mk("errors", "Errors", "count", errs),
    mk("p95", "Duration p95", "ms", p95, true),
    mk("dynamoReads", "DynamoDB reads", "RCU", reads),
    mk("dynamoWrites", "DynamoDB writes", "WCU", writes),
  ];
}
