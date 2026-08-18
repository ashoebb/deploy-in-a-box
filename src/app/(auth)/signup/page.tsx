"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, Field, Input } from "@/components/ui";
import { usePost } from "@/components/useForm";

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const plan = params.get("plan");
  const intent = params.get("intent");
  const { post, busy, error, fieldErrors } = usePost();
  const [form, setForm] = useState({ name: "", businessName: "", email: "", password: "" });

  async function submit() {
    const res = await post<{ ok: true }>("/api/auth/signup", form);
    if (!res) return;
    if (plan) {
      // Plan pre-selected on pricing, go straight to checkout.
      const co = await post<{ url: string }>("/api/checkout", { plan });
      if (co?.url) {
        window.location.href = co.url;
        return;
      }
      router.push("/dashboard");
      return;
    }
    if (intent === "trial") {
      router.push("/trial/apply");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <>
      <h1 className="display-wide font-display text-2xl font-bold text-ink">
        Create your business account
      </h1>
      <p className="mt-1 text-sm text-ink-faint">
        {plan
          ? `You'll pick up the ${plan.charAt(0).toUpperCase() + plan.slice(1)} plan at checkout right after.`
          : intent === "trial"
            ? "Next step after this: your trial application."
            : "Two minutes, then straight to the dashboard."}
      </p>
      <div className="mt-7 space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Your name" error={fieldErrors.name}>
          <Input
            autoComplete="name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="Business name" error={fieldErrors.businessName}>
          <Input
            autoComplete="organization"
            value={form.businessName}
            onChange={(e) => setForm({ ...form, businessName: e.target.value })}
          />
        </Field>
        <Field label="Work email" error={fieldErrors.email}>
          <Input
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Field label="Password" hint="At least 10 characters." error={fieldErrors.password}>
          <Input
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </Field>
        <Button className="w-full py-3" onClick={submit} disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </Button>
        <p className="text-center text-xs text-ink-faint">
          SSO and Google sign-in land here later, the account model already supports adding
          identity providers per organization.
        </p>
        <p className="text-center text-sm text-ink-soft">
          Already have an account?{" "}
          <Link href="/login" className="font-medium underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </div>
    </>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
