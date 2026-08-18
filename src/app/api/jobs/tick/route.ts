import { NextResponse } from "next/server";
import { processTick } from "@/lib/provisioner/engine";
import { processReleaseTick } from "@/lib/provisioner/release";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Provisioning tick, advance every claimable job by one step.
 *
 * Two interchangeable drivers:
 *   1. `npm run worker`, a resident loop calling processTick() every 15s.
 *   2. This endpoint on a schedule (see vercel.json), guarded by CRON_SECRET.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const provisioning = await processTick();
  const releases = await processReleaseTick();
  return NextResponse.json({ provisioning, releases });
}

// Vercel Cron sends GET requests; support both verbs.
export const GET = POST;
