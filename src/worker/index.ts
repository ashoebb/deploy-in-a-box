import "dotenv/config";
import { processTick } from "@/lib/provisioner/engine";
import { processReleaseTick } from "@/lib/provisioner/release";

/**
 * Resident provisioning worker. Run with `npm run worker` on any host with a
 * persistent process (EC2, ECS, Fly, a VPS). If you deploy the web app to
 * Vercel instead, skip this and point a cron at POST /api/jobs/tick — both
 * drive the same engine.
 */
const INTERVAL_MS = 15_000;

async function loop() {
  console.log(`[worker] provisioner started (mode=${process.env.PROVISIONER_MODE ?? "mock"})`);
  for (;;) {
    try {
      const res = await processTick();
      const rel = await processReleaseTick();
      if (res.claimed > 0 || rel.claimed > 0) {
        console.log(
          `[worker] tick: ${res.claimed} provisioning, ${rel.claimed} release(s) advanced`
        );
      }
    } catch (err) {
      console.error("[worker] tick error:", err);
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

loop();
