"use client";

import { useEffect, useState } from "react";

interface Line {
  text: string;
  tone: "dim" | "plain" | "green" | "amber";
}

const LINES: Line[] = [
  { text: "$ diab provision --project acme-crm --env production", tone: "plain" },
  { text: "→ assuming role DeployInABoxProvisioner (external-id ✓)", tone: "dim" },
  { text: "✓ connected to AWS account ····5731 · eu-central-1", tone: "green" },
  { text: "→ creating stack diab-acme-crm-production", tone: "dim" },
  { text: "  AWS::DynamoDB::Table        data       CREATE_COMPLETE", tone: "green" },
  { text: "  AWS::Cognito::UserPool      auth       CREATE_COMPLETE", tone: "green" },
  { text: "  AWS::Lambda::Function       api        CREATE_COMPLETE", tone: "green" },
  { text: "  AWS::ApiGatewayV2::Api      gateway    CREATE_COMPLETE", tone: "green" },
  { text: "  AWS::CloudFront::Distribution cdn      CREATE_IN_PROGRESS", tone: "amber" },
  { text: "  AWS::CloudFront::Distribution cdn      CREATE_COMPLETE", tone: "green" },
  { text: "✓ environment live, 5/5 modules · 14m 22s", tone: "green" },
  { text: "  api: https://x9q2.execute-api.eu-central-1.amazonaws.com", tone: "dim" },
];

const toneClass: Record<Line["tone"], string> = {
  dim: "text-console-dim",
  plain: "text-slate-100",
  green: "text-console-green",
  amber: "text-console-amber",
};

export default function ProvisionConsole() {
  const [visible, setVisible] = useState(1);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setVisible(LINES.length);
      return;
    }
    if (visible >= LINES.length) return;
    const delay = LINES[visible - 1]?.text.startsWith("$") ? 700 : 420;
    const t = setTimeout(() => setVisible((v) => v + 1), delay);
    return () => clearTimeout(t);
  }, [visible]);

  return (
    <div className="overflow-hidden rounded-[6px] border border-console-line bg-console shadow-[0_24px_60px_-24px_rgba(14,27,44,0.55)]">
      <div className="flex items-center justify-between border-b border-console-line px-4 py-2.5">
        <div className="flex items-center gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-console-red/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-console-amber/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-console-green/80" />
        </div>
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-console-dim">
          provisioning · run #0847
        </span>
      </div>
      <div className="min-h-[290px] px-4 py-4 font-mono text-[12.5px] leading-6 sm:px-5">
        {LINES.slice(0, visible).map((line, i) => (
          <div key={i} className={`whitespace-pre ${toneClass[line.tone]}`}>
            {line.text}
          </div>
        ))}
        {visible < LINES.length && (
          <span aria-hidden className="inline-block h-4 w-2 animate-pulse bg-console-green/80" />
        )}
      </div>
      <div className="flex items-center justify-between border-t border-console-line px-4 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-console-dim">
          contents · 5/5 modules
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-console-green">
          this side up ▲
        </span>
      </div>
    </div>
  );
}
