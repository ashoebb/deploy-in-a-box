import { randomUUID, randomBytes } from "crypto";

export const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, "")}`;

/** External ID for the cross-account role trust policy. Not secret, but unguessable. */
export const newExternalId = () => `diab-${randomBytes(12).toString("hex")}`;

export const newToken = () => randomBytes(32).toString("hex");
