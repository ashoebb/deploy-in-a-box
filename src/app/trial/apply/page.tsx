import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { trialApplications } from "@/db/schema";
import { getOrgContext } from "@/lib/auth";
import TrialApplyClient from "./TrialApplyClient";

export const metadata: Metadata = { title: "Trial application" };
export const dynamic = "force-dynamic";

export default async function TrialApplyPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login?next=/trial/apply");

  const existing = await db.query.trialApplications.findFirst({
    where: eq(trialApplications.orgId, ctx.org.id),
  });

  return (
    <TrialApplyClient
      orgName={ctx.org.name}
      existingStatus={existing?.status ?? null}
    />
  );
}
