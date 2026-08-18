CREATE TYPE "public"."environment_kind" AS ENUM('persistent', 'preview');--> statement-breakpoint
CREATE TYPE "public"."git_provider" AS ENUM('github', 'gitlab');--> statement-breakpoint
CREATE TYPE "public"."release_status" AS ENUM('queued', 'building', 'deploying', 'tearing_down', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."release_trigger" AS ENUM('push', 'pr_open', 'pr_sync', 'pr_close', 'manual');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "env_vars" (
	"id" text PRIMARY KEY NOT NULL,
	"environment_id" text NOT NULL,
	"org_id" text NOT NULL,
	"key" text NOT NULL,
	"value_encrypted" text NOT NULL,
	"is_secret" boolean DEFAULT true NOT NULL,
	"updated_by_user_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "git_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"provider" "git_provider" DEFAULT 'github' NOT NULL,
	"installation_id" text,
	"repo_full_name" text NOT NULL,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"webhook_secret" text NOT NULL,
	"previews_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "git_webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "release_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"release_id" text NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"level" "log_level" DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"data" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "releases" (
	"id" text PRIMARY KEY NOT NULL,
	"environment_id" text NOT NULL,
	"org_id" text NOT NULL,
	"git_sha" text NOT NULL,
	"git_ref" text NOT NULL,
	"commit_message" text,
	"commit_author" text,
	"trigger" "release_trigger" NOT NULL,
	"status" "release_status" DEFAULT 'queued' NOT NULL,
	"error_message" text,
	"locked_at" timestamp with time zone,
	"poll_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "kind" "environment_kind" DEFAULT 'persistent' NOT NULL;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "pr_number" integer;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "git_branch" text;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "current_sha" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "env_vars" ADD CONSTRAINT "env_vars_environment_id_deployments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."deployments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "env_vars" ADD CONSTRAINT "env_vars_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "git_connections" ADD CONSTRAINT "git_connections_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "release_logs" ADD CONSTRAINT "release_logs_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "releases" ADD CONSTRAINT "releases_environment_id_deployments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."deployments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "releases" ADD CONSTRAINT "releases_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "env_vars_env_key_unique" ON "env_vars" USING btree ("environment_id","key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "env_vars_env_idx" ON "env_vars" USING btree ("environment_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "git_connections_org_unique" ON "git_connections" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "git_connections_repo_idx" ON "git_connections" USING btree ("repo_full_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "release_logs_rel_idx" ON "release_logs" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "releases_env_idx" ON "releases" USING btree ("environment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "releases_org_idx" ON "releases" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "releases_status_idx" ON "releases" USING btree ("status");