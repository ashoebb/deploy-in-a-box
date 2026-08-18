
# Deploy-in-a-Box

A complete, deployable web application for selling and **automatically fulfilling** a
multi-tenant SaaS starter kit. Customers sign up, pay (or claim a trial slot), connect
their AWS account via a scoped cross-account role, and the platform provisions a
production-grade stack — DynamoDB multi-tenancy, Cognito auth, Lambda + API Gateway,
S3 + CloudFront — **into their AWS account, hands-free**, with live logs in their
dashboard.

Stack: **Next.js 14 (App Router) · TypeScript · Tailwind · Drizzle ORM · PostgreSQL ·
Stripe · AWS SDK v3 (STS + CloudFormation)**

---

## What is fully automated vs. what you finish

**Fully working out of the box (no code changes needed):**

- Signup / login / logout / password reset (JWT session cookie, bcrypt hashes)
- Organization model with per-org AWS **External ID** (multi-member scaffolded)
- Stripe Checkout for the three plans + webhook that activates subscriptions
  (idempotent, signature-verified), customer portal link
- Trial program: configurable slot count + cutoff date stored in DB, intake form,
  atomic slot claiming, auto-approve under capacity, admin approve/reject queue
- Post-purchase intake: AWS account ID + role ARN + region + module toggles, all
  zod-validated (ARN/account cross-checked) before anything runs
- **The provisioning engine** — a queued job pipeline
  (`queued → validating → provisioning → completed/failed`) that:
  - assumes the customer's role via STS with their External ID (`live` mode),
  - launches the CloudFormation stack `infra/customer-stack.yaml` in their account,
  - streams stack events into per-customer structured logs,
  - saves stack outputs (pool IDs, API endpoint, CDN domain) on success,
  - translates common AWS failures (bad trust policy, missing permission, name
    collision) into plain-language fixes, with automatic CloudFormation rollback
- Customer dashboard: plan state, environment list, **live provisioning log**
  (5s polling), outputs, billing portal, support
- **BYOC control plane**: git push-to-deploy releases with PR preview
  environments, encrypted per-environment variables injected at deploy,
  on-demand CloudWatch logs + metrics, and an opt-in DynamoDB Data Studio —
  all through the customer's connector role, nothing stored platform-side
- Admin: customer table, trial window settings + application queue, all runs

**You provide before going live (config, not code):**

1. **Stripe**: real `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and three price IDs
   (`STRIPE_PRICE_STARTER/GROWTH/SCALE`). All placeholders live in `.env.example`.
2. **Platform AWS identity**: `PLATFORM_AWS_ACCOUNT_ID` + credentials for the
   platform principal that assumes customer roles, then `PROVISIONER_MODE=live`.
   Until then, `mock` mode runs the full pipeline against a realistic simulator and
   says so in the UI — nothing is silently faked.
3. **Email**: `MAIL_TRANSPORT=console` prints emails to the server log; set
   `MAIL_TRANSPORT=resend` + `RESEND_API_KEY` for real delivery.
4. **Testimonials**: the homepage ships with three clearly-labeled `PLACEHOLDER`
   testimonials (grep `PLACEHOLDER`).
5. **The app layer on the provisioned stack**: v1 provisions the full infrastructure
   plus a working tenant-scoped sample API (health/me/items endpoints with JWT auth
   and tenant-prefixed keys). Layering your full 40+ endpoint application on top is a
   template revision in `infra/customer-stack.yaml` (swap the inline Lambda for your
   packaged code); the provisioning pipeline needs no changes.
6. **Usage-based billing metering**: the `UsageEventsTable` is provisioned when
   customers pick usage billing, and `src/lib/stripe.ts#reportUsage()` is the marked
   integration point for pushing meter events to Stripe.

---

## Quickstart (local)

Prereqs: Node 20+, PostgreSQL 14+.

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
#    → set DATABASE_URL and AUTH_SECRET (openssl rand -hex 32); leave the rest for later

# 3. Database
createdb diab
npm run db:migrate        # applies ./drizzle migrations

# 4. Admin account (reads ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME from .env)
npm run seed:admin

# 5. Run the web app
npm run dev               # http://localhost:3000

# 6. Run the provisioning worker (second terminal)
npm run worker
```

Then: open **/admin/trials** as the admin → set trial slots (e.g. 25) and a cutoff
date → sign up as a normal user → apply for the trial → connect AWS (any valid-shaped
values in mock mode) → provision → watch the live log complete in ~1 minute.

### Stripe in dev

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
# copy the whsec_… into STRIPE_WEBHOOK_SECRET, restart dev server
```

Use Stripe test mode keys and three recurring prices; checkout + webhook activation
then work end-to-end with test cards.

### Going live with real provisioning

> Full step-by-step for both AWS accounts (console clicks + CLI): see **[LIVE-SETUP.md](./LIVE-SETUP.md)**.

1. Deploy `infra/` nowhere — it ships to customers; **you** need only an IAM user/role
   in your platform account with `sts:AssumeRole` on `arn:aws:iam::*:role/DeployInABoxProvisioner`.
2. Set `PLATFORM_AWS_ACCOUNT_ID`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
   (or run on ECS/EC2 with an instance role and leave keys unset).
3. Set `PROVISIONER_MODE=live`.
4. Customers connect via **Dashboard → Provision**, which hands them
   `public/connector-role.yaml` pre-filled instructions (your account ID + their
   unique External ID) and collects the resulting role ARN.

---

## Deploying the platform itself

**Vercel + external Postgres (Neon/RDS):** push the repo, set every var from
`.env.example`, keep `vercel.json` — its cron hits `/api/jobs/tick` every minute
(sends `Authorization: Bearer $CRON_SECRET`), so no resident worker is needed.

**Anywhere with a long-running process (ECS, Fly, a VM):** run `next start` and
`npm run worker` side by side; skip the cron.

Either driver is safe to run alongside the other — job claiming is atomic
(`UPDATE … RETURNING` with a stale-lock takeover), so ticks never double-provision.

---

## Repo map

```
infra/customer-stack.yaml     # what customers get (CloudFormation, all 5 modules)
public/connector-role.yaml    # what customers run once to grant scoped access
src/db/schema.ts              # full data model (orgs, plans, trials, deployments, logs)
src/lib/provisioner/          # engine.ts (state machine) · aws.ts (STS/CFN) · mock.ts
src/app/(marketing)/          # home · pricing · how-it-works · faq · trial
src/app/(auth)/               # signup · login · forgot/reset password
src/app/dashboard/            # overview · provision · environments/[id] · billing · support
src/app/admin/                # customers · trial program · provisioning runs
src/app/api/                  # auth · checkout · stripe webhook · trial · aws · provision · tick
src/worker/index.ts           # resident tick loop (alternative to Vercel cron)
```

## Security model (summary)

- Customer access = **one** cross-account role, created by the customer from
  `connector-role.yaml`, trust-limited to your platform account **and** their unique
  per-org External ID (confused-deputy protection).
- Permissions scoped to `diab-*` resource names; the template documents the three
  services (Cognito, API Gateway, CloudFront) where AWS offers no name scoping and
  recommends a dedicated member account.
- The platform stores **no AWS keys** for customers — deleting the role revokes
  everything. Every provisioning action lands in the customer's CloudTrail.

