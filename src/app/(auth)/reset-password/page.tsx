"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, Field, Input } from "@/components/ui";
import { usePost } from "@/components/useForm";

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const { post, busy, error, fieldErrors } = usePost();
  const [password, setPassword] = useState("");

  async function submit() {
    const res = await post<{ ok: true }>("/api/auth/reset", { token, password });
    if (res) router.push("/login");
  }

  if (!token) {
    return <Alert tone="error">This reset link is missing its token. Request a new one.</Alert>;
  }

  return (
    <>
      <h1 className="display-wide font-display text-2xl font-bold text-ink">Choose a new password</h1>
      <div className="mt-7 space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="New password" hint="At least 10 characters." error={fieldErrors.password}>
          <Input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </Field>
        <Button className="w-full py-3" onClick={submit} disabled={busy}>
          {busy ? "Saving…" : "Set new password"}
        </Button>
      </div>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
