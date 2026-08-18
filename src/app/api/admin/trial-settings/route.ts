import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { trialSettings } from "@/db/schema";
import { getAdminSession } from "@/lib/auth";
import { jsonError, zodErrorResponse } from "@/lib/api";

const schema = z.object({
  slotsTotal: z.number().int().min(0).max(100000),
  slotsUsed: z.number().int().min(0).max(100000),
  cutoffDate: z.string(), // "yyyy-mm-dd" or ""
  autoApprove: z.boolean(),
  trialLengthDays: z.number().int().min(1).max(365),
});

export async function POST(req: Request) {
  const admin = await getAdminSession();
  if (!admin) return jsonError(403, "Admin only.");

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { slotsTotal, slotsUsed, cutoffDate, autoApprove, trialLengthDays } = parsed.data;

  const cutoff = cutoffDate ? new Date(`${cutoffDate}T23:59:59Z`) : null;
  if (cutoffDate && Number.isNaN(cutoff!.getTime())) {
    return jsonError(400, "Cutoff date is invalid.");
  }

  await db
    .insert(trialSettings)
    .values({ id: "default", slotsTotal, slotsUsed, cutoffDate: cutoff, autoApprove, trialLengthDays })
    .onConflictDoUpdate({
      target: trialSettings.id,
      set: { slotsTotal, slotsUsed, cutoffDate: cutoff, autoApprove, trialLengthDays, updatedAt: new Date() },
    });

  return NextResponse.json({ ok: true });
}
