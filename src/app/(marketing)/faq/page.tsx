import type { Metadata } from "next";
import { Kicker, SectionTitle } from "@/components/ui";

export const metadata: Metadata = { title: "FAQ" };

const SECTIONS: Array<{
  id: string;
  heading: string;
  items: Array<{ q: string; a: string }>;
}> = [
  {
    id: "security",
    heading: "AWS access & security",
    items: [
      {
        q: "What access do you get to my AWS account?",
        a: "Exactly one cross-account IAM role, which you create yourself from our published CloudFormation template. Its trust policy only allows our platform account, and only when the assume-role call includes your unique External ID. The permission policy is scoped to resources named diab-*; for the few services where AWS doesn't support name-based scoping at creation time (Cognito, API Gateway, CloudFront), access is account-wide and the template says so in plain comments. We never ask for, receive, or store access keys.",
      },
      {
        q: "How do I revoke access?",
        a: "Delete the connector-role stack (or the role itself) in your AWS account. Access ends the moment the role is gone, there is nothing on our side to deactivate, because the role was the only credential.",
      },
      {
        q: "Should I use a dedicated AWS account?",
        a: "We recommend it. Provisioning into a fresh member account of your AWS Organization gives you a hard blast-radius boundary, clean billing separation, and makes the account-wide permissions for Cognito/API Gateway/CloudFront a non-issue. It's five minutes in AWS Organizations and it's how we run our own environments.",
      },
      {
        q: "Where do my application's users and data live?",
        a: "Entirely in your AWS account: your Cognito user pool, your DynamoDB tables, your S3 buckets, your CloudFront distribution. We provision them; we don't host them, proxy them, or read them.",
      },
    ],
  },
  {
    id: "data",
    heading: "What data the platform touches",
    items: [
      {
        q: "What do you store about me?",
        a: "Your account details (name, business name, email, a salted password hash), your subscription state from Stripe, your AWS account ID and connector-role ARN, the configuration you enter for each environment, and the provisioning logs for each run (CloudFormation event lines, resource names and statuses, never data inside those resources). Card details live with Stripe; we only hold Stripe's customer and subscription identifiers.",
      },
      {
        q: "Do you see the data inside my provisioned environment?",
        a: "No. Provisioning uses the CloudFormation control plane: create stack, read stack events, read stack outputs. The connector role includes data-plane permissions only so CloudFormation can create and configure the resources; the platform's provisioner never issues data-plane reads against your tables, buckets, or user pool, and every action it takes is visible in your CloudTrail.",
      },
      {
        q: "Can I audit what the platform did?",
        a: "Yes, twice over. Your dashboard keeps the structured log of every provisioning run, and because everything happens via an assumed role in your account, CloudTrail records every API call under the DeployInABoxProvisioner session name.",
      },
    ],
  },
  {
    id: "failures",
    heading: "When provisioning fails",
    items: [
      {
        q: "What happens if a provisioning run fails?",
        a: "CloudFormation rolls back automatically, so a failed run leaves no half-built resources behind. The run is marked failed in your dashboard, the log shows the first failing resource and AWS's reason for it, and you'll see a plain-language explanation of the most common causes, usually a missing permission on the connector role or a name collision with an existing stack.",
      },
      {
        q: "The log says my IAM role is missing permissions. Now what?",
        a: "Re-deploy the latest connector-role.yaml from your dashboard (stack update, ~1 minute), that refreshes the role to the current policy, then press Run again on the failed environment. If it still fails, the log line names the exact permission AWS wanted; send it to support and we'll respond within your plan's SLA.",
      },
      {
        q: "A run failed halfway. Am I paying AWS for anything?",
        a: "No. Rollback deletes what was created, and the stack's resources are pay-per-request serverless anyway, a rolled-back run costs effectively nothing on your AWS bill.",
      },
      {
        q: "Can I re-run provisioning?",
        a: "Yes. Failed runs can be retried from the dashboard once you've fixed the cause. If a previous stack with the same name still exists (for example, one you created manually), delete it in the CloudFormation console or pick a different project name.",
      },
    ],
  },
  {
    id: "support",
    heading: "Support & plans",
    items: [
      {
        q: "What support is included?",
        a: "Starter: email support with a two-business-day response target. Growth: priority email with next-business-day response, plus an architecture review call at onboarding. Scale: a dedicated support channel with same-day response and a quarterly infrastructure review. All plans include the documentation and the provisioning-log diagnostics built into the dashboard.",
      },
      {
        q: "Is there a free trial?",
        a: "A limited number of reviewed trial slots, while they last and until the published cutoff. You apply with a short form about your business and use case; approved trials get full provisioning for one environment, no card required. Apply from the pricing page.",
      },
      {
        q: "What happens to my infrastructure if I cancel?",
        a: "It keeps running and it's yours. Everything was provisioned as standard CloudFormation in your account, so cancellation removes your access to the dashboard, updates, and new provisioning, not your stack. There's no lock-in mechanism to speak of: you already have the source.",
      },
      {
        q: "Which AWS regions are supported?",
        a: "us-east-1, us-east-2, us-west-2, eu-west-1, eu-central-1, ap-southeast-1, ap-south-1, and me-south-1 at launch. If you need another region, tell support, the stack itself is region-agnostic and additions are quick.",
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <section className="mx-auto max-w-wrap px-5 py-16 lg:py-20">
      <Kicker>Answers, in writing</Kicker>
      <SectionTitle>Frequently asked questions</SectionTitle>
      <p className="mt-3 max-w-2xl text-ink-soft">
        The questions every serious buyer asks before letting anything near their AWS account
       , answered specifically, because &ldquo;trust us&rdquo; isn&apos;t an access model.
      </p>

      <div className="mt-12 space-y-14">
        {SECTIONS.map((sec) => (
          <div key={sec.id} id={sec.id} className="scroll-mt-24">
            <h2 className="display-wide border-b-2 border-ink pb-2 font-display text-xl font-bold text-ink">
              {sec.heading}
            </h2>
            <dl className="mt-6 space-y-8">
              {sec.items.map((item) => (
                <div key={item.q} className="max-w-3xl">
                  <dt className="font-display text-[15px] font-bold text-ink">{item.q}</dt>
                  <dd className="mt-2 text-sm leading-relaxed text-ink-soft">{item.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}
