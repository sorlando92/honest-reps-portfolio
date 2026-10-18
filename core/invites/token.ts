import { createHash, randomBytes } from "node:crypto"

/** 32 random bytes, URL safe. Only its hash is stored (invites.token_hash). */
export function newInviteToken(): string {
  return randomBytes(32).toString("base64url")
}

/** Matches claim_invite(): SHA-256 of the UTF-8 token, hex. */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex")
}

export const INVITE_COOKIE = "hr_invite"

/** Tokens are base64url of 32 bytes: 43 characters. */
export function looksLikeInviteToken(value: string | undefined | null): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value)
}
