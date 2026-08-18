import { eq } from "drizzle-orm";
import { db } from "@/db";
import { deployments } from "@/db/schema";
import { appendLog } from "./log";

/**
 * PROVISIONER_MODE=mock, an explicit, env-gated simulation of a run.
 * It exists so you can develop and demo the full product flow (queue →
 * progress → logs → outputs) without touching AWS. It never runs when
 * PROVISIONER_MODE=live; the live path in engine.ts makes real AWS calls.
 */

type Deployment = typeof deployments.$inferSelect;

const PHASES: Array<Array<{ level: "info" | "success"; msg: (d: Deployment) => string }>> = [
  [
    { level: "info", msg: () => "Run started. Validating AWS connection… (mock mode)" },
    {
      level: "success",
      msg: (d) => `Assumed role arn:aws:sts::123456789012:assumed-role/DeployInABoxProvisioner/diab-${d.projectName}`,
    },
    { level: "info", msg: (d) => `Creating CloudFormation stack ${d.stackName} in ${d.region}…` },
  ],
  [
    { level: "info", msg: () => "AWS::DynamoDB::Table DataTable: CREATE_IN_PROGRESS" },
    { level: "info", msg: () => "AWS::DynamoDB::Table TenantsTable: CREATE_IN_PROGRESS" },
    { level: "info", msg: () => "AWS::Cognito::UserPool UserPool: CREATE_IN_PROGRESS" },
  ],
  [
    { level: "success", msg: () => "AWS::DynamoDB::Table DataTable: CREATE_COMPLETE" },
    { level: "success", msg: () => "AWS::DynamoDB::Table TenantsTable: CREATE_COMPLETE" },
    { level: "success", msg: () => "AWS::Cognito::UserPool UserPool: CREATE_COMPLETE" },
    { level: "info", msg: () => "AWS::Lambda::Function ApiFunction: CREATE_IN_PROGRESS" },
    { level: "info", msg: () => "AWS::ApiGatewayV2::Api HttpApi: CREATE_IN_PROGRESS" },
  ],
  [
    { level: "success", msg: () => "AWS::Lambda::Function ApiFunction: CREATE_COMPLETE" },
    { level: "success", msg: () => "AWS::ApiGatewayV2::Api HttpApi: CREATE_COMPLETE" },
    { level: "info", msg: () => "AWS::CloudFront::Distribution CdnDistribution: CREATE_IN_PROGRESS" },
  ],
  [
    { level: "success", msg: () => "AWS::CloudFront::Distribution CdnDistribution: CREATE_COMPLETE" },
    { level: "success", msg: () => "Stack created. Environment is live." },
  ],
];

export async function runMockStep(dep: Deployment) {
  const step = Number(dep.config.mockStep ?? 0);

  if (dep.status === "queued") {
    await db
      .update(deployments)
      .set({ status: "validating", startedAt: new Date() })
      .where(eq(deployments.id, dep.id));
    for (const line of PHASES[0]) await appendLog(dep.id, line.level, line.msg(dep));
    await db
      .update(deployments)
      .set({
        status: "provisioning",
        stackId: `arn:aws:cloudformation:${dep.region}:123456789012:stack/${dep.stackName}/mock`,
        config: { ...dep.config, mockStep: 1 },
        lockedAt: null,
      })
      .where(eq(deployments.id, dep.id));
    return;
  }

  if (dep.status === "provisioning") {
    const phase = PHASES[Math.min(step, PHASES.length - 1)];
    for (const line of phase) await appendLog(dep.id, line.level, line.msg(dep));

    if (step >= PHASES.length - 1) {
      const outputs: Record<string, string> = {
        Region: dep.region,
        UserPoolId: `${dep.region}_MOCKPOOL1`,
        UserPoolClientId: "mockclientid1234567890",
        ApiEndpoint: `https://mock-api.execute-api.${dep.region}.amazonaws.com`,
        DataTableName: `diab-${dep.projectName}-${dep.environment}-data`,
        TenantsTableName: `diab-${dep.projectName}-${dep.environment}-tenants`,
        AssetsBucketName: `diab-${dep.projectName}-${dep.environment}-assets-123456789012`,
        CdnDomainName: "mock1234abcd.cloudfront.net",
      };
      await db
        .update(deployments)
        .set({ status: "completed", outputs, finishedAt: new Date(), lockedAt: null })
        .where(eq(deployments.id, dep.id));
    } else {
      await db
        .update(deployments)
        .set({
          config: { ...dep.config, mockStep: step + 1 },
          pollCount: dep.pollCount + 1,
          lockedAt: null,
        })
        .where(eq(deployments.id, dep.id));
    }
    return;
  }

  if (dep.status === "validating") {
    await db
      .update(deployments)
      .set({ status: "queued", lockedAt: null })
      .where(eq(deployments.id, dep.id));
  }
}
