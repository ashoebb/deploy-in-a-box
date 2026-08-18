"use client";

import { useState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { usePost } from "@/components/useForm";

export default function ForgotPasswordPage() {
  const { post, busy, error } = usePost();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  async function submit() {
    const res = await post<{ ok: true }>("/api/auth/forgot", { email });
    if (res) setSent(true);
  }

  return (
    <>
      <h1 className="display-wide font-display text-2xl font-bold text-ink">Reset your password</h1>
      <p className="mt-1 text-sm text-ink-faint">
        Enter your account email and we&apos;ll send a reset link. It expires in one hour.
      </p>
      <div className="mt-7 space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        {sent ? (
          <Alert tone="success">
            If an account exists for that email, a reset link is on its way. Check your inbox.
          </Alert>
        ) : (
          <>
            <Field label="Email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            </Field>
            <Button className="w-full py-3" onClick={submit} disabled={busy}>
              {busy ? "Sending…" : "Send reset link"}
            </Button>
          </>
        )}
      </div>
    </>
  );
}
