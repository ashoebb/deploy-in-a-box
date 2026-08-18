import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { deployments } from "@/db/schema";
import { getOrgContext } from "@/lib/auth";
import { assumeCustomerRole, friendlyAwsError } from "@/lib/provisioner/aws";
import {
  deleteItem,
  describeKeySchema,
  mockSelect,
  mockTableScan,
  putItem,
  runStatement,
  tablesForEnvironment,
  validateSelectStatement,
} from "@/lib/provisioner/datastudio";
import { jsonError, zodErrorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

const MOCK_KEYS: Record<string, { name: string; type: "HASH" | "RANGE" }[]> = {
  tenants: [{ name: "tenantId", type: "HASH" }],
  data: [
    { name: "pk", type: "HASH" },
    { name: "sk", type: "RANGE" },
  ],
  "usage-events": [
    { name: "pk", type: "HASH" },
    { name: "sk", type: "RANGE" },
  ],
};

async function ownedProvisionedEnv(orgId: string, envId: string) {
  const env = await db.query.deployments.findFirst({
    where: and(eq(deployments.id, envId), eq(deployments.orgId, orgId)),
  });
  if (!env) return { env: null as never, error: jsonError(404, "Environment not found.") };
  if (env.status !== "completed") {
    return { env: null as never, error: jsonError(409, "Data Studio is available once the environment is provisioned.") };
  }
  return { env, error: null };
}

/** GET → table list, or ?table= for key schema + first page of items. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return jsonError(401, "Sign in first.");
  const { env, error } = await ownedProvisionedEnv(ctx.org.id, params.id);
  if (error) return error;

  const outputs = (env.outputs ?? {}) as Record<string, string>;
  const tables = tablesForEnvironment(outputs);
  const mode = process.env.PROVISIONER_MODE === "live" ? "live" : "mock";

  const url = new URL(req.url);
  const table = url.searchParams.get("table");
  if (!table) return NextResponse.json({ mode, tables });

  const meta = tables.find((t) => t.name === table);
  if (!meta) return jsonError(400, "That table doesn't belong to this environment.");

  if (mode === "mock") {
    return NextResponse.json({
      mode,
      keySchema: MOCK_KEYS[meta.label] ?? MOCK_KEYS.data,
      ...mockTableScan({ envId: env.id, table: meta.name, label: meta.label }),
    });
  }

  try {
    const creds = await assumeCustomerRole({
      roleArn: String(env.config.roleArn ?? ""),
      externalId: String(env.config.externalId ?? ""),
      sessionName: "diab-datastudio",
    });
    const keySchema = await describeKeySchema({ region: env.region, creds, table: meta.name });
    const page = await runStatement({
      region: env.region,
      creds,
      statement: `SELECT * FROM "${meta.name}"`,
      nextToken: url.searchParams.get("token") ?? undefined,
    });
    return NextResponse.json({ mode, keySchema, ...page });
  } catch (err) {
    return jsonError(502, dataStudioError(err));
  }
}

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("query"), statement: z.string().min(8).max(2000) }),
  z.object({
    action: z.literal("put"),
    table: z.string().min(1),
    item: z.record(z.unknown()),
  }),
  z.object({
    action: z.literal("delete"),
    table: z.string().min(1),
    key: z.record(z.unknown()),
  }),
]);

/** POST → free-form SELECT, or structured put/delete. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return jsonError(401, "Sign in first.");
  const { env, error } = await ownedProvisionedEnv(ctx.org.id, params.id);
  if (error) return error;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;

  const outputs = (env.outputs ?? {}) as Record<string, string>;
  const tables = tablesForEnvironment(outputs);
  const tableNames = tables.map((t) => t.name);
  const mode = process.env.PROVISIONER_MODE === "live" ? "live" : "mock";

  if (body.action === "query") {
    const invalid = validateSelectStatement(body.statement, tableNames);
    if (invalid) return jsonError(400, invalid);
    if (mode === "mock") {
      return NextResponse.json({ mode, ...mockSelect({ envId: env.id, statement: body.statement, tables }) });
    }
    try {
      const creds = await creds4(env);
      const page = await runStatement({ region: env.region, creds, statement: body.statement });
      return NextResponse.json({ mode, ...page });
    } catch (err) {
      return jsonError(502, dataStudioError(err));
    }
  }

  // Writes: table must belong to the environment.
  if (!tableNames.includes(body.table)) {
    return jsonError(400, "That table doesn't belong to this environment.");
  }

  if (mode === "mock") {
    return NextResponse.json({
      ok: true,
      mode,
      simulated: true,
      note: "Simulation mode, the write was validated and acknowledged, but no data is persisted.",
    });
  }

  try {
    const creds = await creds4(env);
    if (body.action === "put") {
      await putItem({ region: env.region, creds, table: body.table, item: body.item });
    } else {
      await deleteItem({ region: env.region, creds, table: body.table, key: body.key });
    }
    return NextResponse.json({ ok: true, mode });
  } catch (err) {
    return jsonError(502, dataStudioError(err));
  }
}

type Env = NonNullable<Awaited<ReturnType<typeof db.query.deployments.findFirst>>>;
async function creds4(env: Env) {
  return assumeCustomerRole({
    roleArn: String(env.config.roleArn ?? ""),
    externalId: String(env.config.externalId ?? ""),
    sessionName: "diab-datastudio",
  });
}

function dataStudioError(err: unknown): string {
  const msg = friendlyAwsError(err);
  if (/not authorized|AccessDenied/i.test(String(err))) {
    return `${msg} Data Studio needs the opt-in permission tier: re-run connector-role.yaml in your AWS account with EnableDataStudio=true.`;
  }
  return msg;
}
