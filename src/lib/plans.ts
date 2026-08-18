export type PlanId = "trial" | "starter" | "growth" | "scale";

export interface PlanDef {
  id: PlanId;
  name: string;
  priceMonthly: number | null; // null = trial
  priceEnv: string | null; // env var holding the Stripe price id
  tagline: string;
  maxEnvironments: number;
  features: string[];
  cta: string;
  highlighted?: boolean;
}

// Plan definitions. Prices are the ones shown on the pricing page; the actual
// charge comes from the Stripe Price object referenced by env var, so keep
// them in sync when you change either.
export const PLANS: PlanDef[] = [
  {
    id: "starter",
    name: "Starter",
    priceMonthly: 99,
    priceEnv: "STRIPE_PRICE_STARTER",
    tagline: "One product, production-ready from day one.",
    maxEnvironments: 2,
    features: [
      "1 project, staging + production environments",
      "Multi-tenant DynamoDB data layer with tenant isolation",
      "Cognito auth: signup, login, roles, JWT-protected API",
      "Stripe subscription billing hooks",
      "CI/CD pipeline templates (GitHub Actions)",
      "Automated provisioning into your AWS account",
      "Email support, 2 business-day response",
    ],
    cta: "Start with Starter",
  },
  {
    id: "growth",
    name: "Growth",
    priceMonthly: 249,
    priceEnv: "STRIPE_PRICE_GROWTH",
    tagline: "For teams shipping fast and adding usage-based revenue.",
    maxEnvironments: 4,
    features: [
      "Up to 2 projects, 4 environments total",
      "Everything in Starter",
      "Usage-based billing module (metered events table + Stripe hooks)",
      "Re-provisioning and stack updates from the dashboard",
      "Priority email support, next-business-day response",
      "Architecture review call at onboarding",
    ],
    cta: "Choose Growth",
    highlighted: true,
  },
  {
    id: "scale",
    name: "Scale",
    priceMonthly: 699,
    priceEnv: "STRIPE_PRICE_SCALE",
    tagline: "For agencies deploying client SaaS backends on repeat.",
    maxEnvironments: 20,
    features: [
      "Up to 10 projects, 20 environments across client accounts",
      "Everything in Growth",
      "Per-client AWS account connections",
      "White-label environment naming",
      "Dedicated support channel, same-day response",
      "Quarterly infrastructure review",
    ],
    cta: "Choose Scale",
  },
];

export const TRIAL_MAX_ENVIRONMENTS = 1;

export function planById(id: string): PlanDef | undefined {
  return PLANS.find((p) => p.id === id);
}

export function maxEnvironmentsForPlan(plan: string): number {
  if (plan === "trial") return TRIAL_MAX_ENVIRONMENTS;
  return planById(plan)?.maxEnvironments ?? 0;
}
