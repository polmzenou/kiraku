import { createHash, randomBytes } from "node:crypto";

/** Jeton envoyé par e-mail ; seul son hash est stocké en base. */
export function createToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const TOKEN_TTL_MS = {
  VERIFY_EMAIL: 48 * 60 * 60 * 1000,
  RESET_PASSWORD: 60 * 60 * 1000,
} as const;
