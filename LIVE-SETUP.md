# LIVE-SETUP.md — turning on real AWS provisioning

This is the runbook for switching Deploy-in-a-Box from `mock` mode to real
CloudFormation provisioning. Follow it once to run your first live environment.

You will touch **two AWS accounts**:

| Account | Who it is | What happens here |
| --- | --- | --- |
| **Platform** | You, the vendor | Holds the credentials the app uses to assume customer roles. |
| **Customer** | For testing, a second account of yours | Where the connector role and the provisioned stack live. |

One account technically works, but two mirrors production and keeps your
platform's blast radius separate from customer infrastructure.

> Tip: configure two named CLI profiles so every command below is unambiguous.
> ```bash
> aws configure --profile platform    # credentials for the platform account
> aws configure --profile customer     # credentials for the test customer account
> ```

---

## 1. Platform account — create the assume-role identity

The platform needs exactly one power: assume any `DeployInABoxProvisioner`
role. Nothing else.

### Console
1. IAM → Policies → Create policy → JSON tab → paste:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "AssumeConnectorRoles",
         "Effect": "Allow",
         "Action": "sts:AssumeRole",
         "Resource": "arn:aws:iam::*:role/DeployInABoxProvisioner"
       }
     ]
   }
   ```
   Name it `diab-assume-connector`.
2. IAM → Users → Create user → name `diab-platform` → attach `diab-assume-connector`.
3. Open the user → Security credentials → Create access key → "Application running
   outside AWS" → copy the **access key** and **secret**.

> Hosting on EC2/ECS/Fly instead? Attach this policy to the instance role and
> skip the access keys entirely — it's the safer path.

### CLI
```bash
cat > /tmp/platform-policy.json <<'JSON'
{ "Version": "2012-10-17",
  "Statement": [ { "Sid": "AssumeConnectorRoles", "Effect": "Allow",
    "Action": "sts:AssumeRole",
    "Resource": "arn:aws:iam::*:role/DeployInABoxProvisioner" } ] }
JSON

aws --profile platform iam create-user --user-name diab-platform
aws --profile platform iam put-user-policy --user-name diab-platform \
  --policy-name diab-assume-connector \
  --policy-document file:///tmp/platform-policy.json
aws --profile platform iam create-access-key --user-name diab-platform
```

Record your platform account ID — you'll need it in step 2 and the env vars:
```bash
aws --profile platform sts get-caller-identity --query Account --output text
```

---

## 2. Customer account — deploy the connector role

This creates the `DeployInABoxProvisioner` role that trusts your platform
account and your org's unique External ID.

- **PlatformAccountId** = the 12 digits from step 1.
- **ExternalId** = the value shown on your dashboard's Provision page for this org.

### Console
1. CloudFormation → Create stack → With new resources.
2. Upload `public/connector-role.yaml`.
3. Fill `PlatformAccountId` and `ExternalId`.
4. Check **"I acknowledge that this template may create IAM resources with custom names"**.
5. Create. When it's `CREATE_COMPLETE`, open the **Outputs** tab and copy `RoleArn`.

### CLI
```bash
aws --profile customer cloudformation deploy \
  --template-file public/connector-role.yaml \
  --stack-name diab-connector-role \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    PlatformAccountId=<PLATFORM_ACCOUNT_ID> \
    ExternalId=<EXTERNAL_ID_FROM_DASHBOARD> \
    EnableDataStudio=false   # "true" opts in to dashboard item-level data access

# copy the role ARN:
aws --profile customer cloudformation describe-stacks \
  --stack-name diab-connector-role \
  --query "Stacks[0].Outputs[?OutputKey=='RoleArn'].OutputValue" --output text
```

### Optional: prove the trust chain works before touching the app
Run this with your **platform** credentials — it's exactly what the app does:
```bash
aws --profile platform sts assume-role \
  --role-arn arn:aws:iam::<CUSTOMER_ACCOUNT_ID>:role/DeployInABoxProvisioner \
  --role-session-name diab-test \
  --external-id <EXTERNAL_ID_FROM_DASHBOARD>
```
Temporary credentials returned = success. `AccessDenied` = the trust policy,
External ID, or platform credentials don't line up.

---

## 3. Wire it into the app

Set these where the app runs (Vercel project settings, or your `.env` locally),
then restart:

```bash
PROVISIONER_MODE=live
PLATFORM_AWS_ACCOUNT_ID=<PLATFORM_ACCOUNT_ID>
AWS_ACCESS_KEY_ID=<platform user key>        # omit if using an instance role
AWS_SECRET_ACCESS_KEY=<platform user secret> # omit if using an instance role
AWS_REGION=us-east-1
```

`PLATFORM_AWS_ACCOUNT_ID` is what the dashboard shows customers in the connector
instructions, so it must be correct.

---

## 4. First live run

1. Dashboard → **Provision** → connect AWS: paste the customer account ID, the
   `RoleArn` from step 2, and pick a region.
2. Tap **Test AWS connection**. Green ✓ = assume-role and CloudFormation both
   work. Red = it names the exact problem; fix and retest in seconds.
3. Provision a `staging` environment and watch the live log. A full stack takes
   ~5–10 minutes; CloudFront is the slow part.
4. When it completes, open the `ApiEndpoint` output and hit `/health`:
   ```bash
   curl https://<api-endpoint>/health      # -> {"ok":true,"env":"staging"}
   ```
   That's a real, live customer environment.

---

## 5. Teardown (do this after each test)

Provisioned infrastructure is real and bills to the **customer** account.
DynamoDB and Lambda are ~free at idle, but a live CloudFront distribution and
Cognito pool accrue small charges.

```bash
# remove a provisioned environment (name is diab-<project>-<env>)
aws --profile customer cloudformation delete-stack --stack-name diab-<project>-<env>

# revoke ALL platform access instantly (removes the connector role)
aws --profile customer cloudformation delete-stack --stack-name diab-connector-role
```

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `AccessDenied` on assume-role | Trust policy, External ID, or platform creds mismatch | Re-check step 2 params; rerun the step-2 optional test. |
| `... is not authorized to perform: <action>` mid-run | Connector role missing a permission | Re-deploy the latest `connector-role.yaml`; it carries the current policy. |
| `AlreadyExistsException` | A stack with that name already exists | Delete it in the customer console or pick a new project name/environment. |
| Preflight green but provision fails at CloudFront | CloudFront is global and slow | Give it up to ~15 min; check the failing event's reason in the log. |
| Test button says "simulation mode" | `PROVISIONER_MODE` still `mock` | Set it to `live` (step 3) and restart. |
| Logs/metrics tabs return a permission error | Connector role predates v2 | Re-run the latest `connector-role.yaml` (adds read-only observability). |
| Data Studio returns a permission error | `EnableDataStudio` not granted | Re-run `connector-role.yaml` with `EnableDataStudio=true` — it's opt-in by design. |

---

## Security recap

- Customer access is **one** cross-account role they create and can delete at
  will — you never hold their AWS keys.
- The role's trust policy is pinned to your platform account **and** a per-org
  External ID (confused-deputy protection).
- Permissions are scoped to `diab-*` resource names wherever AWS supports it;
  Cognito, API Gateway, and CloudFront are account-wide by necessity, which is
  why a dedicated customer member account is recommended.
- Every provisioning action lands in the customer's own CloudTrail under the
  session name `diab-provisioner`.
