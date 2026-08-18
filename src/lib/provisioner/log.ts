import { db } from "@/db";
import { deploymentLogs } from "@/db/schema";
import { newId } from "@/lib/id";

export type LogLevel = "info" | "warn" | "error" | "success";

export async function appendLog(
  deploymentId: string,
  level: LogLevel,
  message: string,
  data?: Record<string, unknown>
) {
  await db.insert(deploymentLogs).values({
    id: newId("log"),
    deploymentId,
    level,
    message,
    data: data ?? null,
  });
}
