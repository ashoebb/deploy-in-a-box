import { createHmac, timingSafeEqual, createSign } from "crypto";

/**
 * GitHub integration for the BYOC control plane.
 *
 * Auth model: a GitHub App (not OAuth), customers install it on exactly the
 * repos they choose; tokens are per-installation and short-lived, and access
 * survives the connecting employee leaving the customer's company.
 *
 * Platform env:
 *   GITHUB_APP_ID         , numeric app id
 *   GITHUB_APP_PRIVATE_KEY, PEM (RS256), \n-escaped or raw
 *
 * GIT_MODE=mock (default when app creds are unset) makes token/tarball calls
 * return simulated results so the whole pipeline runs without GitHub, same
 * honesty contract as PROVISIONER_MODE=mock.
 */

export function gitMode(): "live" | "mock" {
  if (process.env.GIT_MODE === "mock") return "mock";
  return process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY ? "live" : "mock";
}

// ── Webhook signature ────────────────────────────────────────────────────────

/** Constant-time verify of X-Hub-Signature-256 against the connection secret. */
export function verifyGitHubSignature(
  payload: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const provided = signatureHeader.slice("sha256=".length);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
}

// ── GitHub App auth ──────────────────────────────────────────────────────────

function appJwt(): string {
  const appId = process.env.GITHUB_APP_ID!;
  const pem = process.env.GITHUB_APP_PRIVATE_KEY!.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claims = Buffer.from(
    JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: appId })
  ).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(pem).toString("base64url");
  return `${header}.${claims}.${signature}`;
}

/** Short-lived installation token for API + tarball access. */
export async function installationToken(installationId: string): Promise<string> {
  if (gitMode() === "mock") return "mock-installation-token";
  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${appJwt()}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  );
  if (!res.ok) {
    throw new Error(`GitHub App token exchange failed (HTTP ${res.status}). Check GITHUB_APP_ID / private key and that the app is still installed on the repo.`);
  }
  const data = (await res.json()) as { token: string };
  return data.token;
}

// ── Source download ──────────────────────────────────────────────────────────

/**
 * Download the repo tarball at a specific SHA. Returns the bytes; the release
 * engine unpacks and builds them in an isolated temp dir.
 * In mock mode returns null, the engine simulates the build.
 */
export async function downloadTarball(opts: {
  installationId: string;
  repoFullName: string;
  sha: string;
}): Promise<Buffer | null> {
  if (gitMode() === "mock") return null;
  const token = await installationToken(opts.installationId);
  const res = await fetch(
    `https://api.github.com/repos/${opts.repoFullName}/tarball/${opts.sha}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      redirect: "follow",
    }
  );
  if (!res.ok) {
    throw new Error(`Couldn't download source at ${opts.sha.slice(0, 7)} (HTTP ${res.status}). The commit may have been force-pushed away, or the app lost repo access.`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** Comment on a PR (used to post preview environment URLs). No-op in mock mode. */
export async function commentOnPr(opts: {
  installationId: string;
  repoFullName: string;
  prNumber: number;
  body: string;
}): Promise<void> {
  if (gitMode() === "mock") return;
  const token = await installationToken(opts.installationId);
  await fetch(
    `https://api.github.com/repos/${opts.repoFullName}/issues/${opts.prNumber}/comments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body: opts.body }),
    }
  );
}
