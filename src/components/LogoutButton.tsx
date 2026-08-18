"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
        router.refresh();
      }}
      className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint hover:text-ink"
    >
      Sign out
    </button>
  );
}
