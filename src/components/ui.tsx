import Link from "next/link";
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const cx = (...parts: Array<string | false | undefined>) => parts.filter(Boolean).join(" ");

// ── Buttons ──────────────────────────────────────────────────────────────────

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-[4px] px-5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

const buttonStyles = {
  primary: "bg-cargo text-white hover:bg-cargo-dark",
  ink: "bg-ink text-paper hover:bg-ink-soft",
  outline: "border border-ink/30 text-ink hover:border-ink hover:bg-ink/5",
  ghost: "text-ink-soft hover:text-ink hover:bg-ink/5",
  danger: "border border-console-red/50 text-console-red hover:bg-console-red/10",
} as const;

type Variant = keyof typeof buttonStyles;

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={cx(buttonBase, buttonStyles[variant], className)} {...props} />;
}

export function ButtonLink({
  href,
  variant = "primary",
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={cx(buttonBase, buttonStyles[variant], className)}>
      {children}
    </Link>
  );
}

// ── Form controls ────────────────────────────────────────────────────────────

const controlBase =
  "w-full rounded-[4px] border border-ink/25 bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return <input className={cx(controlBase, className)} {...rest} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, ...rest } = props;
  return <select className={cx(controlBase, className)} {...rest} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props;
  return <textarea className={cx(controlBase, "min-h-28", className)} {...rest} />;
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-ink">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-medium text-console-red">{error}</span>}
    </label>
  );
}

// ── Surfaces ─────────────────────────────────────────────────────────────────

export function Card({
  title,
  action,
  className,
  children,
}: {
  title?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("rounded-[6px] border border-line bg-white", className)}>
      {title && (
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
          <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-ink-faint">
            {title}
          </h2>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

export function Alert({
  tone = "info",
  children,
}: {
  tone?: "info" | "error" | "success" | "warn";
  children: ReactNode;
}) {
  const tones = {
    info: "border-ink/20 bg-ink/5 text-ink",
    error: "border-console-red/40 bg-console-red/10 text-[#9F1239]",
    success: "border-emerald-600/30 bg-emerald-600/10 text-emerald-900",
    warn: "border-cargo/40 bg-cargo-tint text-cargo-dark",
  } as const;
  return (
    <div className={cx("rounded-[4px] border px-4 py-3 text-sm", tones[tone])}>{children}</div>
  );
}

// ── Section furniture ────────────────────────────────────────────────────────

/** Mono uppercase eyebrow with a cargo tick, used to label every section. */
export function Kicker({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
      <span aria-hidden className="inline-block h-[3px] w-5 bg-cargo" />
      {children}
    </p>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="display-wide font-display text-3xl font-bold text-ink sm:text-4xl">
      {children}
    </h2>
  );
}

const statusTone: Record<string, string> = {
  queued: "bg-ink/10 text-ink-soft",
  building: "bg-cargo-tint text-cargo-dark",
  deploying: "bg-cargo-tint text-cargo-dark",
  tearing_down: "bg-ink/10 text-ink-soft",
  deleted: "bg-ink/10 text-ink-soft",
  validating: "bg-cargo-tint text-cargo-dark",
  provisioning: "bg-cargo-tint text-cargo-dark",
  completed: "bg-emerald-600/15 text-emerald-800",
  failed: "bg-console-red/15 text-[#9F1239]",
  active: "bg-emerald-600/15 text-emerald-800",
  trialing: "bg-cargo-tint text-cargo-dark",
  past_due: "bg-console-red/15 text-[#9F1239]",
  canceled: "bg-ink/10 text-ink-soft",
  inactive: "bg-ink/10 text-ink-soft",
  pending: "bg-cargo-tint text-cargo-dark",
  approved: "bg-emerald-600/15 text-emerald-800",
  rejected: "bg-console-red/15 text-[#9F1239]",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-[3px] px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide",
        statusTone[status] ?? "bg-ink/10 text-ink-soft"
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}
