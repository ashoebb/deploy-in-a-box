"use client";

import { useState } from "react";

/** Tiny helper for JSON POSTs from client forms with field-level errors. */
export function usePost() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function post<T = unknown>(url: string, body: unknown): Promise<T | null> {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        fieldErrors?: Record<string, string>;
      } & T;
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        setFieldErrors(data.fieldErrors ?? {});
        return null;
      }
      return data as T;
    } catch {
      setError("Network error. Check your connection and try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  return { post, busy, error, fieldErrors };
}
