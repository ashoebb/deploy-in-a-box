import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ── Enums ────────────────────────────────────────────────────────────────────

export const platformRoleEnum = pgEnum("platform_role", ["user", "admin"]);
export const orgRoleEnum = pgEnum("org_role", ["owner", "member"]);
export const planEnum = pgEnum("plan", ["none", "trial", "starter", "growth", "scale"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "inactive",
  "trialing",
  "active",
  "past_due",
  "canceled",
]);
export const trialAppStatusEnum = pgEnum("trial_app_status", [
  "pending",
  "approved",
  "rejected",
]);
export const deploymentStatusEnum = pgEnum("deployment_status", [
  "queued",
  "validating",
  "provisioning",
  "completed",
  "failed",
  "deleted", // torn-down preview environments — kept for the release audit trail
]);
export const logLevelEnum = pgEnum("log_level", ["info", "warn", "error", "success"]);
export const environmentKindEnum = pgEnum("environment_kind", ["persistent", "preview"]);
export const gitProviderEnum = pgEnum("git_provider", ["github", "gitlab"]);
export const releaseTriggerEnum = pgEnum("release_trigger", [
  "push",
  "pr_open",
  "pr_sync",
  "pr_close",
  "manual",
]);
export const releaseStatusEnum = pgEnum("release_status", [
  "queued",
  "building",
  "deploying",
  "tearing_down",
  "completed",
  "failed",
]);

// ── Core accounts ────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  platformRole: platformRoleEnum("platform_role").notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  // External ID for the customer's cross-account IAM role trust policy.
  // Generated once at org creation; shown in the AWS connection instructions.
  externalId: text("external_id").notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  plan: planEnum("plan").notNull().default("none"),
  subscriptionStatus: subscriptionStatusEnum("subscription_status")
    .notNull()
    .default("inactive"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One business account today, multiple team members later. Invites are not in
// v1 UI, but the membership model is here so adding them is additive.
export const memberships = pgTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    role: orgRoleEnum("role").notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userOrgUnique: uniqueIndex("memberships_user_org_unique").on(t.userId, t.orgId),
  })
);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Trial program ────────────────────────────────────────────────────────────

// Singleton row (id = "default"). Slots and cutoff are data, not code — set
// the real numbers in the admin panel, nothing is hardcoded into logic.
export const trialSettings = pgTable("trial_settings", {
  id: text("id").primaryKey(),
  slotsTotal: integer("slots_total").notNull().default(0),
  slotsUsed: integer("slots_used").notNull().default(0),
  cutoffDate: timestamp("cutoff_date", { withTimezone: true }),
  autoApprove: boolean("auto_approve").notNull().default(true),
  trialLengthDays: integer("trial_length_days").notNull().default(14),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const trialApplications = pgTable("trial_applications", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  businessName: text("business_name").notNull(),
  website: text("website"),
  projectStage: text("project_stage").notNull(), // idea | building | launched | scaling
  awsFamiliarity: text("aws_familiarity").notNull(), // none | some | daily
  useCase: text("use_case").notNull(),
  status: trialAppStatusEnum("status").notNull().default("pending"),
  decisionNote: text("decision_note"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decidedBy: text("decided_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── AWS connection ───────────────────────────────────────────────────────────

export const awsConnections = pgTable("aws_connections", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .unique()
    .references(() => organizations.id, { onDelete: "cascade" }),
  awsAccountId: text("aws_account_id").notNull(),
  roleArn: text("role_arn").notNull(),
  defaultRegion: text("default_region").notNull(),
  lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Provisioning ─────────────────────────────────────────────────────────────

export const deployments = pgTable(
  "deployments",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectName: text("project_name").notNull(), // slug, becomes part of stack name
    environment: text("environment").notNull(), // staging | production
    region: text("region").notNull(),
    // Snapshot of the configuration used for this run (toggles, ARNs, etc.)
    config: jsonb("config").notNull().$type<Record<string, unknown>>(),
    status: deploymentStatusEnum("status").notNull().default("queued"),
    // ── BYOC control-plane fields: a row is a long-lived ENVIRONMENT ──
    kind: environmentKindEnum("kind").notNull().default("persistent"),
    prNumber: integer("pr_number"), // set for preview environments
    gitBranch: text("git_branch"),
    currentSha: text("current_sha"), // release SHA currently live
    stackName: text("stack_name").notNull(),
    stackId: text("stack_id"),
    errorMessage: text("error_message"),
    outputs: jsonb("outputs").$type<Record<string, string>>(),
    // Job-runner bookkeeping
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    pollCount: integer("poll_count").notNull().default(0),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index("deployments_org_idx").on(t.orgId),
    statusIdx: index("deployments_status_idx").on(t.status),
  })
);

export const deploymentLogs = pgTable(
  "deployment_logs",
  {
    id: text("id").primaryKey(),
    deploymentId: text("deployment_id")
      .notNull()
      .references(() => deployments.id, { onDelete: "cascade" }),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    level: logLevelEnum("level").notNull().default("info"),
    message: text("message").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>(),
  },
  (t) => ({
    depIdx: index("deployment_logs_dep_idx").on(t.deploymentId),
  })
);

// ── Git integration (BYOC control plane) ─────────────────────────────────────

export const gitConnections = pgTable(
  "git_connections",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    provider: gitProviderEnum("provider").notNull().default("github"),
    // GitHub App installation id (or GitLab project hook id later).
    installationId: text("installation_id"),
    repoFullName: text("repo_full_name").notNull(), // "org/repo"
    defaultBranch: text("default_branch").notNull().default("main"),
    // HMAC secret for webhook signature verification (per-connection).
    webhookSecret: text("webhook_secret").notNull(),
    previewsEnabled: boolean("previews_enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgUnique: uniqueIndex("git_connections_org_unique").on(t.orgId),
    repoIdx: index("git_connections_repo_idx").on(t.repoFullName),
  })
);

// One row per deploy attempt — the CI/CD unit of work.
export const releases = pgTable(
  "releases",
  {
    id: text("id").primaryKey(),
    environmentId: text("environment_id")
      .notNull()
      .references(() => deployments.id, { onDelete: "cascade" }),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    gitSha: text("git_sha").notNull(),
    gitRef: text("git_ref").notNull(), // "refs/heads/main" or "refs/pull/7"
    commitMessage: text("commit_message"),
    commitAuthor: text("commit_author"),
    trigger: releaseTriggerEnum("trigger").notNull(),
    status: releaseStatusEnum("status").notNull().default("queued"),
    errorMessage: text("error_message"),
    // Job-runner bookkeeping — same atomic-claim pattern as deployments.
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    pollCount: integer("poll_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => ({
    envIdx: index("releases_env_idx").on(t.environmentId),
    orgIdx: index("releases_org_idx").on(t.orgId),
    statusIdx: index("releases_status_idx").on(t.status),
  })
);

export const releaseLogs = pgTable(
  "release_logs",
  {
    id: text("id").primaryKey(),
    releaseId: text("release_id")
      .notNull()
      .references(() => releases.id, { onDelete: "cascade" }),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    level: logLevelEnum("level").notNull().default("info"),
    message: text("message").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>(),
  },
  (t) => ({
    relIdx: index("release_logs_rel_idx").on(t.releaseId),
  })
);

// Environment variables / secrets, injected into Lambda config on deploy.
// valueEncrypted is AES-256-GCM sealed with SECRETS_KEY — plaintext never stored.
export const envVars = pgTable(
  "env_vars",
  {
    id: text("id").primaryKey(),
    environmentId: text("environment_id")
      .notNull()
      .references(() => deployments.id, { onDelete: "cascade" }),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    valueEncrypted: text("value_encrypted").notNull(),
    isSecret: boolean("is_secret").notNull().default(true),
    updatedByUserId: text("updated_by_user_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    envKeyUnique: uniqueIndex("env_vars_env_key_unique").on(t.environmentId, t.key),
    envIdx: index("env_vars_env_idx").on(t.environmentId),
  })
);

// Git webhook idempotency — mirrors webhookEvents for Stripe.
export const gitWebhookDeliveries = pgTable("git_webhook_deliveries", {
  id: text("id").primaryKey(), // X-GitHub-Delivery guid
  event: text("event").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Stripe webhook idempotency ───────────────────────────────────────────────

export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(), // Stripe event id
  type: text("type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});
