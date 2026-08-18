import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * Application-side sealing for customer environment variables.
 *
 * Format: v1.<iv_b64>.<tag_b64>.<ciphertext_b64>
 * Key:    SECRETS_KEY, 64 hex chars (32 bytes). Generate once with
 *         `openssl rand -hex 32` and never rotate casually: rotating requires
 *         re-encrypting every env_vars row (a re-seal script, not a key swap).
 *
 * Plaintext is never stored and secret values are never returned by GET APIs.
 */

function key(): Buffer {
  const hex = process.env.SECRETS_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      "SECRETS_KEY must be set to 64 hex characters (openssl rand -hex 32) to store environment variables."
    );
  }
  return Buffer.from(hex, "hex");
}

export function seal(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
}

export function open(sealed: string): string {
  const [version, ivB64, tagB64, ctB64] = sealed.split(".");
  if (version !== "v1" || !ivB64 || !tagB64 || !ctB64) {
    throw new Error("Unrecognized sealed value format.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
