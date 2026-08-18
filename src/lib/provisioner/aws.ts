import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import {
  CloudFormationClient,
  CreateStackCommand,
  DescribeStacksCommand,
  DescribeStackEventsCommand,
  type Parameter,
  type StackEvent,
} from "@aws-sdk/client-cloudformation";
import { readFileSync } from "fs";
import path from "path";

export interface AssumedCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  assumedRoleArn: string;
}

/**
 * Assume the customer's connector role using their External ID.
 * The platform's own credentials (env/instance role) sign the STS call.
 */
export async function assumeCustomerRole(opts: {
  roleArn: string;
  externalId: string;
  sessionName: string;
}): Promise<AssumedCredentials> {
  const sts = new STSClient({ region: process.env.AWS_REGION ?? "us-east-1" });
  const res = await sts.send(
    new AssumeRoleCommand({
      RoleArn: opts.roleArn,
      ExternalId: opts.externalId,
      RoleSessionName: opts.sessionName.slice(0, 64),
      DurationSeconds: 3600,
    })
  );
  const c = res.Credentials;
  if (!c?.AccessKeyId || !c.SecretAccessKey || !c.SessionToken) {
    throw new Error("STS returned no credentials");
  }
  return {
    accessKeyId: c.AccessKeyId,
    secretAccessKey: c.SecretAccessKey,
    sessionToken: c.SessionToken,
    assumedRoleArn: res.AssumedRoleUser?.Arn ?? opts.roleArn,
  };
}

export function cfnClient(region: string, creds: AssumedCredentials) {
  return new CloudFormationClient({
    region,
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
    },
  });
}

let _template: string | null = null;
export function customerStackTemplate(): string {
  if (_template) return _template;
  _template = readFileSync(
    path.join(process.cwd(), "infra", "customer-stack.yaml"),
    "utf8"
  );
  return _template;
}

export async function createCustomerStack(
  cfn: CloudFormationClient,
  opts: {
    stackName: string;
    projectName: string;
    environment: string;
    enableUsageBilling: boolean;
    cognitoCallbackUrl: string;
  }
): Promise<string> {
  const parameters: Parameter[] = [
    { ParameterKey: "ProjectName", ParameterValue: opts.projectName },
    { ParameterKey: "Environment", ParameterValue: opts.environment },
    {
      ParameterKey: "EnableUsageBilling",
      ParameterValue: opts.enableUsageBilling ? "true" : "false",
    },
    { ParameterKey: "CognitoCallbackUrl", ParameterValue: opts.cognitoCallbackUrl },
  ];
  const res = await cfn.send(
    new CreateStackCommand({
      StackName: opts.stackName,
      TemplateBody: customerStackTemplate(),
      Parameters: parameters,
      Capabilities: ["CAPABILITY_NAMED_IAM"],
      OnFailure: "ROLLBACK",
      Tags: [
        { Key: "diab:managed", Value: "true" },
        { Key: "diab:project", Value: opts.projectName },
        { Key: "diab:environment", Value: opts.environment },
      ],
    })
  );
  if (!res.StackId) throw new Error("CloudFormation returned no StackId");
  return res.StackId;
}

export interface StackPoll {
  status: string;
  statusReason?: string;
  outputs: Record<string, string>;
  newEvents: StackEvent[];
}

export async function pollStack(
  cfn: CloudFormationClient,
  stackName: string,
  sinceEventAt: Date | null
): Promise<StackPoll> {
  const desc = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
  const stack = desc.Stacks?.[0];
  if (!stack) throw new Error(`Stack ${stackName} not found`);

  const outputs: Record<string, string> = {};
  for (const o of stack.Outputs ?? []) {
    if (o.OutputKey && o.OutputValue) outputs[o.OutputKey] = o.OutputValue;
  }

  let newEvents: StackEvent[] = [];
  try {
    const ev = await cfn.send(new DescribeStackEventsCommand({ StackName: stackName }));
    newEvents = (ev.StackEvents ?? [])
      .filter((e) => e.Timestamp && (!sinceEventAt || e.Timestamp > sinceEventAt))
      .sort((a, b) => a.Timestamp!.getTime() - b.Timestamp!.getTime());
  } catch {
    // Events are best-effort; describe-stacks status is authoritative.
  }

  return {
    status: stack.StackStatus ?? "UNKNOWN",
    statusReason: stack.StackStatusReason,
    outputs,
    newEvents,
  };
}

/** Translate raw AWS errors into something a customer can act on. */
export function friendlyAwsError(err: unknown): string {
  const name = (err as { name?: string })?.name ?? "";
  const message = (err as { message?: string })?.message ?? String(err);

  if (name === "AccessDenied" || /not authorized to perform: sts:AssumeRole/i.test(message)) {
    return (
      "We couldn't assume your connector role. Check that the role exists, its trust " +
      "policy allows our platform account, and the External ID matches the one shown " +
      "in your dashboard exactly. Re-run the connector-role stack if unsure."
    );
  }
  if (name === "ExpiredToken" || name === "ExpiredTokenException") {
    return "AWS session expired mid-run. The run will need to be retried.";
  }
  if (name === "AlreadyExistsException") {
    return (
      "A stack with this name already exists in your account. Delete it in the " +
      "CloudFormation console or choose a different project name / environment."
    );
  }
  if (name === "InsufficientCapabilitiesException") {
    return "CloudFormation rejected the IAM capability. This is a platform bug, contact support.";
  }
  if (/is not authorized to perform/i.test(message)) {
    return (
      "Your connector role is missing a permission CloudFormation needed: " +
      message +
      ", re-deploy the latest connector-role.yaml to pick up the current policy."
    );
  }
  return message;
}

/**
 * Preflight: prove the platform can assume the customer's role AND that
 * CloudFormation is reachable with the customer-stack template valid, WITHOUT
 * committing to a full ~8-minute run. Called by the "Test connection" button.
 * Returns { ok } or throws, callers wrap with friendlyAwsError.
 */
export async function preflightConnection(opts: {
  roleArn: string;
  externalId: string;
  region: string;
}): Promise<{ ok: true; assumedRoleArn: string }> {
  const creds = await assumeCustomerRole({
    roleArn: opts.roleArn,
    externalId: opts.externalId,
    sessionName: "diab-preflight",
  });
  const cfn = cfnClient(opts.region, creds);
  // ValidateTemplate exercises real CloudFormation access with the assumed
  // credentials and confirms the template AWS will deploy is well-formed.
  const { ValidateTemplateCommand } = await import("@aws-sdk/client-cloudformation");
  await cfn.send(new ValidateTemplateCommand({ TemplateBody: customerStackTemplate() }));
  return { ok: true, assumedRoleArn: creds.assumedRoleArn };
}

// ── BYOC control plane: Lambda code/config updates & teardown ────────────────

import {
  LambdaClient,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  GetFunctionConfigurationCommand,
} from "@aws-sdk/client-lambda";
import { DeleteStackCommand } from "@aws-sdk/client-cloudformation";

export function lambdaClient(region: string, creds: AssumedCredentials) {
  return new LambdaClient({
    region,
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
    },
  });
}

/** Push a new code bundle to the environment's Lambda. */
export async function updateFunctionCode(opts: {
  region: string;
  creds: AssumedCredentials;
  functionName: string;
  zip: Buffer;
}) {
  const lambda = lambdaClient(opts.region, opts.creds);
  await lambda.send(
    new UpdateFunctionCodeCommand({
      FunctionName: opts.functionName,
      ZipFile: opts.zip,
    })
  );
}

/** Replace the function's environment variables (merge is done by the caller). */
export async function updateFunctionEnv(opts: {
  region: string;
  creds: AssumedCredentials;
  functionName: string;
  variables: Record<string, string>;
}) {
  const lambda = lambdaClient(opts.region, opts.creds);
  await lambda.send(
    new UpdateFunctionConfigurationCommand({
      FunctionName: opts.functionName,
      Environment: { Variables: opts.variables },
    })
  );
}

/**
 * Lambda updates are async: poll until LastUpdateStatus leaves InProgress.
 * Returns true on Successful, throws with the reason on Failed.
 */
export async function waitForFunctionUpdated(opts: {
  region: string;
  creds: AssumedCredentials;
  functionName: string;
  timeoutMs?: number;
}): Promise<void> {
  const lambda = lambdaClient(opts.region, opts.creds);
  const deadline = Date.now() + (opts.timeoutMs ?? 60_000);
  for (;;) {
    const cfg = await lambda.send(
      new GetFunctionConfigurationCommand({ FunctionName: opts.functionName })
    );
    if (cfg.LastUpdateStatus === "Successful") return;
    if (cfg.LastUpdateStatus === "Failed") {
      throw new Error(
        `Lambda update failed: ${cfg.LastUpdateStatusReason ?? "no reason given by AWS"}`
      );
    }
    if (Date.now() > deadline) throw new Error("Timed out waiting for the Lambda update to finish.");
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/** Tear down a provisioned environment stack (used for preview envs on PR close). */
export async function deleteCustomerStack(opts: {
  region: string;
  creds: AssumedCredentials;
  stackName: string;
}) {
  const cfn = cfnClient(opts.region, opts.creds);
  await cfn.send(new DeleteStackCommand({ StackName: opts.stackName }));
}
