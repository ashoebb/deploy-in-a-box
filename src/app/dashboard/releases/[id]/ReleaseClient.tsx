"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Alert, Kicker, StatusBadge } from "@/components/ui";

type Release = {
  id: string;
  environmentId: string;
  gitSha: string;
  gitRef: string;
  commitMessage: string | null;
  commitAuthor: string | null;
  trigger: string;
  status: "queued" | "building" | "deploying" | "tearing_down" | "completed" | "failed";
  errorMessage: string | null;
  createdAt: string;
  finishedAt: string | null;
};

type LogLine = {
  id: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
  createdAt: string;
};

const ACTIVE: Release["status"][] = ["queued", "building", "deploying", "tearing_down"];

export default function ReleaseClient({ id }: { id: string }) {
  const [release, setRelease] = useState<Release | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [notFound, setNotFound] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/releases/${id}`, { cache: "no-store" });
    if (res.status === 404) {
      setNotFound(true);
      return null;
    }
    if (!res.ok) return null;
    const data = (await res.json()) as { release: Release; logs: LogLine[] };
    setRelease(data.release);
    setLogs(data.logs);
    return data.release;
  }, [id]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    async function loop() {
      const rel = await load();
      if (stopped) return;
      if (!rel || ACTIVE.includes(rel.status)) timer = setTimeout(loop, 4000);
    }
    loop();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [load]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [logs.length]);

  if (notFound) {
    return (
      <Alert tone="error">
        This release doesn&apos;t exist or belongs to a different organization.{" "}
        <Link href="/dashboard" className="font-medium underline underline-offset-4">Back to overview</Link>
      </Alert>
    );
  }
  if (!release) {
    return <p className="py-10 text-center font-mono text-sm text-ink-faint">loading release…</p>;
  }

  const isActive = ACTIVE.includes(release.status);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Kicker>Release</Kicker>
          <h1 className="display-wide font-display text-2xl font-bold text-ink">
            {release.gitSha.slice(0, 7)}
            <span className="ml-3 text-base font-normal text-ink-faint">{release.trigger}</span>
          </h1>
          <p className="mt-1 font-mono text-[12px] text-ink-faint">
            {release.gitRef}
            {release.commitAuthor ? ` · by ${release.commitAuthor}` : ""}
          </p>
          {release.commitMessage && (
            <p className="mt-1 max-w-xl truncate text-sm text-ink-soft">{release.commitMessage}</p>
          )}
        </div>
        <div className="flex items-center gap-4">
          <Link
            href={`/dashboard/environments/${release.environmentId}`}
            className="text-sm text-ink-soft underline underline-offset-4"
          >
            environment →
          </Link>
          <StatusBadge status={release.status} />
        </div>
      </div>

      {release.status === "failed" && release.errorMessage && (
        <Alert tone="error">
          <strong>Release failed:</strong> {release.errorMessage}
        </Alert>
      )}

      <div className="overflow-hidden rounded-[6px] border border-console-line">
        <div className="flex items-center justify-between border-b border-console-line bg-console px-4 py-2.5">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-console-dim">
            release log {isActive && <span className="text-console-green">· live</span>}
          </p>
          {isActive && <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-console-green" />}
        </div>
        <div className="max-h-[460px] overflow-y-auto bg-console px-4 py-3">
          {logs.length === 0 ? (
            <p className="font-mono text-[13px] text-console-dim">waiting for worker…</p>
          ) : (
            logs.map((line) => (
              <p key={line.id} className="font-mono text-[13px] leading-relaxed">
                <span className="text-console-dim">
                  {new Date(line.createdAt).toISOString().slice(11, 19)}{" "}
                </span>
                <span
                  className={
                    line.level === "error"
                      ? "text-red-400"
                      : line.level === "warn"
                        ? "text-amber-300"
                        : line.level === "success"
                          ? "text-console-green"
                          : "text-slate-200"
                  }
                >
                  {line.message}
                </span>
              </p>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
}
