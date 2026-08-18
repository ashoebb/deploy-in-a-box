import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { gitConnections } from "@/db/schema";
import { getOrgContext } from "@/lib/auth";
import { gitConnectionSchema } from "@/lib/validation";
import { newId, newToken } from "@/lib/id";
import { jsonError, zodErrorResponse } from "@/lib/api";
import { gitMode } from "@/lib/git";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return jsonError(401, "Sign in first.");
  const conn = await db.query.gitConnections.findFirst({
    where: eq(gitConnections.orgId, ctx.org.id),
  });
  return NextResponse.json({
    connection: conn
      ? {
          repoFullName: conn.repoFullName,
          defaultBranch: conn.defaultBranch,
          previewsEnabled: conn.previewsEnabled,
          webhookSecret: conn.webhookSecret,
          installationId: conn.installationId,
        }
      : null,
    gitMode: gitMode(),
    webhookUrl: `${process.env.APP_URL ?? "http://localhost:3000"}/api/git/webhook`,
  });
}

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return jsonError(401, "Sign in first.");

  const parsed = gitConnectionSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { repoFullName, defaultBranch, previewsEnabled } = parsed.data;

  const existing = await db.query.gitConnections.findFirst({
    where: eq(gitConnections.orgId, ctx.org.id),
  });
  // Repo names are the webhook's lookup key, refuse duplicates across orgs.
  const taken = await db.query.gitConnections.findFirst({
    where: eq(gitConnections.repoFullName, repoFullName),
  });
  if (taken && taken.orgId !== ctx.org.id) {
    return jsonError(409, "That repository is already connected to a different organization.");
  }

  let webhookSecret: string;
  if (existing) {
    webhookSecret = existing.webhookSecret;
    await db
      .update(gitConnections)
      .set({ repoFullName, defaultBranch, previewsEnabled })
      .where(eq(gitConnections.id, existing.id));
  } else {
    webhookSecret = newToken();
    await db.insert(gitConnections).values({
      id: newId("git"),
      orgId: ctx.org.id,
      repoFullName,
      defaultBranch,
      previewsEnabled,
      webhookSecret,
    });
  }
  return NextResponse.json({ ok: true, webhookSecret });
}
