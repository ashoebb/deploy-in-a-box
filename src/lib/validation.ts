import { z } from "zod";
import { REGION_IDS } from "./regions";

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email");
export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters");

export const signupSchema = z.object({
  name: z.string().trim().min(2, "Enter your name"),
  businessName: z.string().trim().min(2, "Enter your business name"),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password"),
});

export const forgotSchema = z.object({ email: emailSchema });

export const resetSchema = z.object({
  token: z.string().min(10),
  password: passwordSchema,
});

export const trialApplicationSchema = z.object({
  businessName: z.string().trim().min(2, "Enter your business name"),
  website: z
    .string()
    .trim()
    .url("Enter a full URL, e.g. https://example.com")
    .optional()
    .or(z.literal("")),
  projectStage: z.enum(["idea", "building", "launched", "scaling"]),
  awsFamiliarity: z.enum(["none", "some", "daily"]),
  useCase: z.string().trim().min(30, "Give us at least a couple of sentences"),
});

// AWS account IDs are exactly 12 digits.
export const awsAccountIdSchema = z
  .string()
  .trim()
  .regex(/^\d{12}$/, "AWS account ID is exactly 12 digits");

// arn:aws:iam::123456789012:role/Name (path segments allowed)
export const roleArnSchema = z
  .string()
  .trim()
  .regex(
    /^arn:aws:iam::\d{12}:role\/[\w+=,.@\/-]+$/,
    "Enter a valid IAM role ARN (arn:aws:iam::123456789012:role/RoleName)"
  );

export const awsConnectionSchema = z
  .object({
    awsAccountId: awsAccountIdSchema,
    roleArn: roleArnSchema,
    defaultRegion: z.enum(REGION_IDS as unknown as [string, ...string[]]),
  })
  .refine((v) => v.roleArn.includes(`::${v.awsAccountId}:`), {
    message: "The role ARN must belong to the AWS account ID you entered",
    path: ["roleArn"],
  });

export const projectNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z][a-z0-9-]{2,23}$/,
    "3–24 chars, lowercase letters, numbers, hyphens; must start with a letter"
  );

export const provisionSchema = z.object({
  projectName: projectNameSchema,
  environment: z.enum(["staging", "production"]),
  region: z.enum(REGION_IDS as unknown as [string, ...string[]]),
  // Component toggles
  enableUsageBilling: z.boolean().default(false),
  billingModel: z.enum(["subscription", "usage", "both"]).default("subscription"),
  authProviders: z.array(z.enum(["email"])).default(["email"]), // "google" | "sso" reserved for a later template revision
  cognitoCallbackUrl: z
    .string()
    .trim()
    .url("Enter a full callback URL")
    .default("http://localhost:3000/auth/callback"),
});

export type ProvisionInput = z.infer<typeof provisionSchema>;

// ── BYOC control plane ───────────────────────────────────────────────────────

export const gitConnectionSchema = z.object({
  repoFullName: z
    .string()
    .regex(/^[\w.-]+\/[\w.-]+$/, "Use the owner/repo format, e.g. nilelabs/crm-api"),
  defaultBranch: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[\w./-]+$/, "Branch names can use letters, digits, ., /, -"),
  previewsEnabled: z.boolean(),
});

export const envVarSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Keys look like SHELL_VARIABLES: letters, digits, underscores, not starting with a digit"),
  value: z.string().min(1, "Value can't be empty").max(4000),
  isSecret: z.boolean().default(true),
});

export const manualDeploySchema = z.object({
  gitSha: z
    .string()
    .regex(/^[0-9a-f]{7,40}$/i, "Provide a commit SHA (7–40 hex characters)")
    .optional(),
});
