"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, Field, Input } from "@/components/ui";
import { usePost } from "@/components/useForm";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { post, busy, error, fieldErrors } = usePost();
  const [form, setForm] = useState({ email: "", password: "" });

  async function submit() {
    const res = await post<{ ok: true; isAdmin: boolean }>("/api/auth/login", form);
    if (!res) return;
    const next = params.get("next");
    router.push(next && next.startsWith("/") ? next : res.isAdmin ? "/admin" : "/dashboard");
  }

  return (
    <>
      <h1 className="display-wide font-display text-2xl font-bold text-ink">Sign in</h1>
      <div className="mt-7 space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Email" error={fieldErrors.email}>
          <Input
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Field label="Password" error={fieldErrors.password}>
          <Input
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </Field>
        <Button className="w-full py-3" onClick={submit} disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
        <div className="flex justify-between text-sm">
          <Link href="/forgot-password" className="text-ink-soft underline underline-offset-4">
            Forgot password?
          </Link>
          <Link href="/signup" className="text-ink-soft underline underline-offset-4">
            Create an account
          </Link>
        </div>
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
