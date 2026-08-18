"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Input, Kicker, Select, Textarea } from "@/components/ui";
import { usePost } from "@/components/useForm";

export default function TrialApplyClient({
  orgName,
  existingStatus,
}: {
  orgName: string;
  existingStatus: "pending" | "approved" | "rejected" | null;
}) {
  const router = useRouter();
  const { post, busy, error, fieldErrors } = usePost();
  const [result, setResult] = useState<"approved" | "pending" | null>(null);
  const [form, setForm] = useState({
    businessName: orgName,
    website: "",
    projectStage: "building" as "idea" | "building" | "launched" | "scaling",
    awsFamiliarity: "some" as "none" | "some" | "daily",
    useCase: "",
  });

  const status = result ?? existingStatus;

  if (status === "approved") {
    return (
      <Shell>
        <Alert tone="success">
          <strong>Trial approved.</strong> Provisioning is unlocked for one environment.{" "}
          <Link href="/dashboard/provision" className="font-medium underline underline-offset-4">
            Provision it now →
          </Link>
        </Alert>
      </Shell>
    );
  }
  if (status === "pending") {
    return (
      <Shell>
        <Alert tone="info">
          Your application is in review, you&apos;ll hear back by email. In the meantime you can{" "}
          <Link href="/dashboard" className="font-medium underline underline-offset-4">
            explore your dashboard
          </Link>
          .
        </Alert>
      </Shell>
    );
  }
  if (status === "rejected") {
    return (
      <Shell>
        <Alert tone="warn">
          This organization&apos;s application wasn&apos;t approved for the current window. You can
          still <Link href="/pricing" className="font-medium underline underline-offset-4">start on a paid plan</Link>.
        </Alert>
      </Shell>
    );
  }

  async function submit() {
    const res = await post<{ ok: true; status: "approved" | "pending" }>(
      "/api/trial/apply",
      form
    );
    if (res) {
      setResult(res.status);
      // The dashboard layout's plan badge is server-rendered; refresh the RSC
      // cache so "no plan" flips to "trial" immediately.
      router.refresh();
    }
  }

  return (
    <Shell>
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Business name" error={fieldErrors.businessName}>
          <Input
            value={form.businessName}
            onChange={(e) => setForm({ ...form, businessName: e.target.value })}
          />
        </Field>
        <Field label="Website (optional)" error={fieldErrors.website}>
          <Input
            placeholder="https://…"
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value.trim() })}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project stage" error={fieldErrors.projectStage}>
            <Select
              value={form.projectStage}
              onChange={(e) => setForm({ ...form, projectStage: e.target.value as typeof form.projectStage })}
            >
              <option value="idea">Idea, validating</option>
              <option value="building">Building the MVP</option>
              <option value="launched">Launched, early customers</option>
              <option value="scaling">Scaling an existing product</option>
            </Select>
          </Field>
          <Field label="AWS familiarity" error={fieldErrors.awsFamiliarity}>
            <Select
              value={form.awsFamiliarity}
              onChange={(e) => setForm({ ...form, awsFamiliarity: e.target.value as typeof form.awsFamiliarity })}
            >
              <option value="none">New to AWS</option>
              <option value="some">Some experience</option>
              <option value="daily">Use it daily</option>
            </Select>
          </Field>
        </div>
        <Field
          label="What will you build on it?"
          hint="A sentence or three, this is what the review reads. Min 30 characters."
          error={fieldErrors.useCase}
        >
          <Textarea
            rows={4}
            value={form.useCase}
            onChange={(e) => setForm({ ...form, useCase: e.target.value })}
          />
        </Field>
        <Button className="w-full py-3" onClick={submit} disabled={busy}>
          {busy ? "Submitting…" : "Submit application"}
        </Button>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl px-5 py-14">
      <Kicker>Free trial</Kicker>
      <h1 className="display-wide font-display text-2xl font-bold text-ink">
        Apply for a trial slot
      </h1>
      <p className="mt-1 text-sm text-ink-faint">
        Slots are limited; approvals are automatic while capacity and the window allow.
      </p>
      <div className="mt-7">{children}</div>
    </div>
  );
}
