import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { awsConnections } from "@/db/schema";
import { getOrgContext } from "@/lib/auth";
import ProvisionClient from "./ProvisionClient";

export const metadata: Metadata = { title: "Provision" };
export const dynamic = "force-dynamic";

export default async function ProvisionPage() {
  const ctx = (await getOrgContext())!;
  const connection = await db.query.awsConnections.findFirst({
    where: eq(awsConnections.orgId, ctx.org.id),
  });

  const orgActive =
    (ctx.org.subscriptionStatus === "active" || ctx.org.subscriptionStatus === "trialing") &&
    !(
      ctx.org.plan === "trial" &&
      ctx.org.trialEndsAt &&
      ctx.org.trialEndsAt.getTime() < Date.now()
    );

  return (
    <ProvisionClient
      externalId={ctx.org.externalId}
      platformAccountId={process.env.PLATFORM_AWS_ACCOUNT_ID ?? "<set PLATFORM_AWS_ACCOUNT_ID>"}
      provisionerMode={(process.env.PROVISIONER_MODE ?? "mock") as "mock" | "live"}
      orgActive={orgActive}
      connection={
        connection
          ? {
              awsAccountId: connection.awsAccountId,
              roleArn: connection.roleArn,
              defaultRegion: connection.defaultRegion,
            }
          : null
      }
    />
  );
}
