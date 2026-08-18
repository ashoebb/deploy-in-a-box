import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, organizations, memberships, trialSettings } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { newId, newExternalId } from "@/lib/id";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? "Platform Admin";
  if (!email || !password) {
    console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD in .env first.");
    process.exit(1);
  }

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) {
    await db
      .update(users)
      .set({ platformRole: "admin", passwordHash: await hashPassword(password) })
      .where(eq(users.id, existing.id));
    console.log(`User ${email} already existed — promoted to admin and password reset to match .env.`);
  } else {
    const userId = newId("usr");
    const orgId = newId("org");
    await db.insert(users).values({
      id: userId,
      email,
      passwordHash: await hashPassword(password),
      name,
      platformRole: "admin",
    });
    await db.insert(organizations).values({
      id: orgId,
      name: "Platform",
      externalId: newExternalId(),
    });
    await db.insert(memberships).values({ id: newId("mem"), userId, orgId, role: "owner" });
    console.log(`Admin ${email} created.`);
  }

  // Ensure the trial settings singleton exists. Real numbers are set in /admin.
  const settings = await db.query.trialSettings.findFirst({
    where: eq(trialSettings.id, "default"),
  });
  if (!settings) {
    await db.insert(trialSettings).values({
      id: "default",
      slotsTotal: 0,
      slotsUsed: 0,
      cutoffDate: null,
      autoApprove: true,
      trialLengthDays: 14,
    });
    console.log("Trial settings row created (slots=0 — configure in /admin/trials).");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
