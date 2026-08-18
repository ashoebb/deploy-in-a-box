import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, trialApplications, trialSettings } from "@/db/schema";
import TrialsAdminClient from "./TrialsAdminClient";

export const metadata: Metadata = { title: "Admin · Trial program" };
export const dynamic = "force-dynamic";

export default async function AdminTrialsPage() {
  const [settings, apps] = await Promise.all([
    db.query.trialSettings.findFirst({ where: eq(trialSettings.id, "default") }),
    db
      .select({
        id: trialApplications.id,
        businessName: trialApplications.businessName,
        website: trialApplications.website,
        projectStage: trialApplications.projectStage,
        awsFamiliarity: trialApplications.awsFamiliarity,
        useCase: trialApplications.useCase,
        status: trialApplications.status,
        decisionNote: trialApplications.decisionNote,
        createdAt: trialApplications.createdAt,
        orgName: organizations.name,
      })
      .from(trialApplications)
      .innerJoin(organizations, eq(organizations.id, trialApplications.orgId))
      .orderBy(desc(trialApplications.createdAt)),
  ]);

  return (
    <TrialsAdminClient
      settings={
        settings
          ? {
              slotsTotal: settings.slotsTotal,
              slotsUsed: settings.slotsUsed,
              cutoffDate: settings.cutoffDate ? settings.cutoffDate.toISOString().slice(0, 10) : "",
              autoApprove: settings.autoApprove,
              trialLengthDays: settings.trialLengthDays,
            }
          : { slotsTotal: 0, slotsUsed: 0, cutoffDate: "", autoApprove: true, trialLengthDays: 14 }
      }
      applications={apps.map((a) => ({
        ...a,
        website: a.website ?? "",
        decisionNote: a.decisionNote ?? "",
        createdAt: a.createdAt.toISOString().slice(0, 10),
      }))}
    />
  );
}
