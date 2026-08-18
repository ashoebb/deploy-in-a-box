import {
  DynamoDBClient,
  DescribeTableCommand,
  ExecuteStatementCommand,
  PutItemCommand,
  DeleteItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import type { AssumedCredentials } from "./aws";

/**
 * DynamoDB Data Studio, browse, query, edit, and delete items in the
 * customer's provisioned tables without the AWS Console.
 *
 * Safety model:
 *  - Free-form PartiQL is SELECT-ONLY and must target one of the environment's
 *    own tables; writes go through structured put/delete endpoints so the UI
 *    can confirm destructive actions.
 *  - Item access is a bigger trust grant than deploying infrastructure, so the
 *    connector role gates it behind an opt-in template parameter
 *    (EnableDataStudio), see public/connector-role.yaml.
 *  - Mock mode serves a deterministic dataset; writes are acknowledged but not
 *    persisted, and every response is labeled simulated.
 */

export interface TableInfo {
  name: string;
  label: string;
  keySchema: { name: string; type: "HASH" | "RANGE" }[];
}

export interface ItemsPage {
  items: Record<string, unknown>[];
  nextToken: string | null;
  simulated: boolean;
}

/** The environment's tables, derived from stack outputs, no AWS call needed. */
export function tablesForEnvironment(outputs: Record<string, string>): { name: string; label: string }[] {
  const tables: { name: string; label: string }[] = [];
  if (outputs.TenantsTableName) tables.push({ name: outputs.TenantsTableName, label: "tenants" });
  if (outputs.DataTableName) tables.push({ name: outputs.DataTableName, label: "data" });
  if (outputs.UsageEventsTableName)
    tables.push({ name: outputs.UsageEventsTableName, label: "usage-events" });
  return tables;
}

const SELECT_ONLY = /^\s*select\s/i;
const FORBIDDEN = /\b(insert|update|delete|drop|create|alter)\b/i;

/** Free-form statements must be SELECT and reference one of the env's tables. */
export function validateSelectStatement(statement: string, allowedTables: string[]): string | null {
  if (!SELECT_ONLY.test(statement)) return "Only SELECT statements are allowed here, use the item editor for writes.";
  if (FORBIDDEN.test(statement)) return "That statement contains a write keyword. Free-form queries are read-only.";
  const touchesOwn = allowedTables.some((t) => statement.includes(`"${t}"`));
  if (!touchesOwn) {
    return `Query one of this environment's tables (wrap the name in double quotes): ${allowedTables.join(", ")}.`;
  }
  return null;
}

// ── Live operations ──────────────────────────────────────────────────────────

function client(region: string, creds: AssumedCredentials) {
  return new DynamoDBClient({
    region,
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
    },
  });
}

export async function describeKeySchema(opts: {
  region: string;
  creds: AssumedCredentials;
  table: string;
}): Promise<TableInfo["keySchema"]> {
  const res = await client(opts.region, opts.creds).send(
    new DescribeTableCommand({ TableName: opts.table })
  );
  return (res.Table?.KeySchema ?? []).map((k) => ({
    name: k.AttributeName!,
    type: k.KeyType as "HASH" | "RANGE",
  }));
}

export async function runStatement(opts: {
  region: string;
  creds: AssumedCredentials;
  statement: string;
  nextToken?: string;
  limit?: number;
}): Promise<ItemsPage> {
  const res = await client(opts.region, opts.creds).send(
    new ExecuteStatementCommand({
      Statement: opts.statement,
      NextToken: opts.nextToken,
      Limit: Math.min(opts.limit ?? 50, 100),
    })
  );
  return {
    items: (res.Items ?? []).map((i) => unmarshall(i)),
    nextToken: res.NextToken ?? null,
    simulated: false,
  };
}

export async function putItem(opts: {
  region: string;
  creds: AssumedCredentials;
  table: string;
  item: Record<string, unknown>;
}): Promise<void> {
  await client(opts.region, opts.creds).send(
    new PutItemCommand({
      TableName: opts.table,
      Item: marshall(opts.item, { removeUndefinedValues: true }),
    })
  );
}

export async function deleteItem(opts: {
  region: string;
  creds: AssumedCredentials;
  table: string;
  key: Record<string, unknown>;
}): Promise<void> {
  await client(opts.region, opts.creds).send(
    new DeleteItemCommand({
      TableName: opts.table,
      Key: marshall(opts.key, { removeUndefinedValues: true }),
    })
  );
}

// ── Mock dataset (deterministic per environment) ─────────────────────────────

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

const MOCK_PLANS = ["free", "pro", "pro", "enterprise"];
const MOCK_NAMES = ["Acme Freight", "Blue Nile Trading", "Cairo Cargo", "Delta Ship Co", "Eastline Exports"];

export function mockTableScan(opts: {
  envId: string;
  table: string;
  label: string;
}): ItemsPage {
  const rand = seeded(`${opts.envId}:${opts.label}`);
  const items: Record<string, unknown>[] = [];
  if (opts.label === "tenants") {
    for (let i = 0; i < 5; i++) {
      items.push({
        tenantId: `t_${10 + i}`,
        name: MOCK_NAMES[i],
        plan: MOCK_PLANS[Math.floor(rand() * MOCK_PLANS.length)],
        seats: Math.floor(2 + rand() * 20),
        createdAt: new Date(Date.now() - Math.floor(rand() * 90) * 86400000)
          .toISOString()
          .slice(0, 10),
      });
    }
  } else if (opts.label === "data") {
    for (let i = 0; i < 5; i++) {
      const tenant = `t_${10 + Math.floor(rand() * 5)}`;
      items.push(
        {
          pk: `${tenant}#item`,
          sk: `i_${100 + i * 2}`,
          title: ["Q3 shipment plan", "Customs docs", "Fleet roster", "Invoice batch", "Route map"][i],
          status: rand() < 0.7 ? "active" : "archived",
          updatedAt: new Date(Date.now() - Math.floor(rand() * 14) * 86400000).toISOString(),
        },
        {
          pk: `${tenant}#user`,
          sk: `u_${200 + i}`,
          email: `user${i}@${MOCK_NAMES[i % 5].toLowerCase().replace(/[^a-z]/g, "")}.com`,
          role: rand() < 0.3 ? "admin" : "member",
        }
      );
    }
  } else {
    for (let i = 0; i < 8; i++) {
      items.push({
        pk: `t_${10 + Math.floor(rand() * 5)}`,
        sk: `evt_${Date.now() - i * 3600000}`,
        metric: rand() < 0.5 ? "api_call" : "storage_gb",
        quantity: Math.floor(1 + rand() * 40),
      });
    }
  }
  return { items, nextToken: null, simulated: true };
}

/** Very small SELECT interpreter for mock mode: scans the fake table, honors a
 *  single `where field = 'value'` clause if present. Enough to demo the flow. */
export function mockSelect(opts: {
  envId: string;
  statement: string;
  tables: { name: string; label: string }[];
}): ItemsPage {
  const target = opts.tables.find((t) => opts.statement.includes(`"${t.name}"`));
  if (!target) return { items: [], nextToken: null, simulated: true };
  const page = mockTableScan({ envId: opts.envId, table: target.name, label: target.label });
  const where = opts.statement.match(/where\s+([\w.]+)\s*=\s*'([^']*)'/i);
  if (where) {
    const [, field, value] = where;
    page.items = page.items.filter((i) => String(i[field]) === value);
  }
  return page;
}
