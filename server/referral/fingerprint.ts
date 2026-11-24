import { createHmac } from "node:crypto";
import { normalizeEmail } from "@/lib/anticheat/email";
import type { Tx } from "../social/lock";

// Empreintes d'un filleul (parrainage v2) : HMAC-SHA256 de son id Discord et de son e-mail normalisé (alias ramenés à
// la même boîte), avec une clé dérivée d'AUTH_SECRET et passée par l'appelant. Gardées après une déliaison ou la
// suppression du compte : un même compte Discord ou une même boîte n'est filleul qu'une fois. Rien en clair en base.

export type Fingerprint = { kind: "DISCORD" | "EMAIL"; hash: string };

/** Clé des empreintes, dérivée du secret de l'app (jamais le secret lui-même). */
export function fingerprintKey(authSecret: string): Buffer {
  return createHmac("sha256", authSecret).update("kiraku/referral-v2/referee-fingerprint").digest();
}

export function refereeFingerprints(input: { discordId: string | null; email: string | null }, key: Buffer): Fingerprint[] {
  const prints: Fingerprint[] = [];
  if (input.discordId) prints.push({ kind: "DISCORD", hash: createHmac("sha256", key).update(`discord:${input.discordId}`).digest("hex") });
  const email = normalizeEmail(input.email);
  if (email) prints.push({ kind: "EMAIL", hash: createHmac("sha256", key).update(`email:${email}`).digest("hex") });
  return prints;
}

/** Empreintes d'un joueur, lues en base : Discord lié et e-mail. */
export async function userFingerprints(tx: Tx, userId: string, key: Buffer): Promise<Fingerprint[]> {
  const [user, discord] = await Promise.all([
    tx.user.findUnique({ where: { id: userId }, select: { email: true } }),
    tx.account.findFirst({ where: { userId, provider: "discord" }, select: { providerAccountId: true } }),
  ]);
  return refereeFingerprints({ discordId: discord?.providerAccountId ?? null, email: user?.email ?? null }, key);
}

/** Une de ces empreintes a-t-elle déjà servi à un parrainage (autre que `exceptReferralId`) ? */
export async function fingerprintTaken(tx: Tx, prints: readonly Fingerprint[], exceptReferralId: string | null = null): Promise<boolean> {
  if (prints.length === 0) return false;
  const rows = await tx.refereeFingerprint.findMany({
    where: { OR: prints.map((p) => ({ kind: p.kind, hash: p.hash })) },
    select: { referralId: true },
  });
  return rows.some((r) => exceptReferralId === null || r.referralId !== exceptReferralId);
}

/**
 * Avant la suppression ou l'anonymisation d'un compte filleul : ses empreintes du moment (un e-mail changé depuis le
 * rattachement, un Discord lié ensuite) sont gardées avec son parrainage, pour qu'un compte neuf avec la même boîte ou
 * le même Discord ne redevienne pas filleul. Rien à faire pour un compte qui n'a pas été parrainé.
 */
export async function keepRefereeFingerprints(tx: Tx, userId: string, key: Buffer): Promise<void> {
  const referral = await tx.referral.findUnique({ where: { refereeId: userId }, select: { id: true } });
  if (!referral) return;
  await recordFingerprints(tx, await userFingerprints(tx, userId, key), referral.id);
}

/** Garde les empreintes du filleul ; une empreinte déjà connue ne change pas de parrainage. */
export async function recordFingerprints(tx: Tx, prints: readonly Fingerprint[], referralId: string): Promise<void> {
  for (const p of prints) {
    await tx.$executeRaw`
      INSERT INTO "RefereeFingerprint" (kind, hash, "referralId") VALUES (${p.kind}::"FingerprintKind", ${p.hash}, ${referralId})
      ON CONFLICT (kind, hash) DO NOTHING`;
  }
}
