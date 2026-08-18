import { NextResponse } from "next/server";
import type { ZodError } from "zod";

export function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export function zodErrorResponse(err: ZodError) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return NextResponse.json(
    { error: "Check the highlighted fields.", fieldErrors },
    { status: 400 }
  );
}
