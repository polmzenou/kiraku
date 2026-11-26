import type { PrismaClient } from "@/generated/prisma/client";
import { snowflakeDate } from "@/lib/discord/snowflake";
import { parseInviteCode } from "@/lib/referral/codes";
import type { ReferralV2Rules } from "@/lib/referral/rules";
import { blocksBetween, lockPlayers } from "../social/lock";
import { fingerprintTaken, recordFingerprints, userFingerprints } from "./fingerprint";

// Rattachement v2 : remplace l'appel v1 quand l'interrupteur referral.v2.enabled est allumé. Le code standard ou le code
// perso est accepté. Les deux joueurs sont verrouillés (deux rattachements simultanés d'un même filleul n'en gardent
// qu'un, le plafond est compté sous verrou). Refusés : soi-même, un invité, un filleul déjà rattaché ou dont le compte
// Discord ou la boîte e-mail ont déjà servi (empreintes), hors de la fenêtre de saisie (comptée depuis l'inscription),
// un parrain invité, banni, bloqué ou descendant du filleul (cycle, même lointain), un parrain au plafond (levé pendant
// l'Ennichi). Rien n'est versé ici : progressReferralWith fait tomber l'étape 1 juste après.

export type AttachV2Refusal = "DISABLED" | "INVALID_CODE" | "NO_USER" | "SELF" | "GUEST" | "ALREADY_REFERRED" | "TOO_LATE" | "REFERRER_FULL";

export class ReferralV2Error extends Error {
  constructor(readonly code: AttachV2Refusal) {
    super(code);
  }
}

export type AttachV2Input = {
  refereeId: string;
  /** Code saisi ou reçu par lien, tel quel. */
  code: string;
  now: Date;
  rules: Pick<ReferralV2Rules, "enabled" | "maxPerMonth">;
  /** referral.attachWindowDays : jours pendant lesquels un compte peut saisir un code après son inscription. */
  attachWindowDays: number;
  /** Édition de l'Ennichi en cours (bonus des étapes 1 et 2), sinon null. */
  ennichiEdition: number | null;
  /**
   * ennichi.stepMultiplier en vigueur, figé sur le parrainage s'il arrive pendant la fête (ignoré hors fête) : les
   * versements le relisent ici, même longtemps après (étape 2, validation de l'équipe).
   */
  ennichiMultiplier: number | null;
  /** ennichi.liftCap : pendant la fête, le plafond mensuel ne s'applique pas (par défaut oui). */
  ennichiLiftCap?: boolean;
  fingerprintKey: Buffer;
};

const TX = { maxWait: 10_000, timeout: 20_000 };
const DAY = 86_400_000;
const MONTH = 30 * DAY;

export async function attachReferralV2With(db: PrismaClient, input: AttachV2Input): Promise<{ referralId: string; referrerId: string }> {
  if (!input.rules.enabled) throw new ReferralV2Error("DISABLED");
  const parsed = parseInviteCode(input.code);
  if (!parsed) throw new ReferralV2Error("INVALID_CODE");
  const owner = await db.user.findUnique({
    where: parsed.kind === "STANDARD" ? { referralCode: parsed.code } : { vanityCode: parsed.code },
    select: { id: true },
  });
  if (!owner) throw new ReferralV2Error("INVALID_CODE");

  return db.$transaction(async (tx) => {
    const players = await lockPlayers(tx, [input.refereeId, owner.id]);
    const referee = players.get(input.refereeId);
    const referrer = players.get(owner.id);
    if (!referee) throw new ReferralV2Error("NO_USER");
    if (!referrer) throw new ReferralV2Error("INVALID_CODE");
    if (referee.id === referrer.id) throw new ReferralV2Error("SELF");
    if (referee.isGuest) throw new ReferralV2Error("GUEST");

    const [account, existing, blocks, recent, cycle, prints, discord, grand] = await Promise.all([
      tx.user.findUnique({ where: { id: referee.id }, select: { registeredAt: true, createdAt: true, referredById: true } }),
      tx.referral.findUnique({ where: { refereeId: referee.id }, select: { id: true } }),
      blocksBetween(tx, referee.id, referrer.id),
      input.ennichiEdition !== null && input.ennichiLiftCap !== false
        ? Promise.resolve(0)
        : tx.referral.count({ where: { referrerId: referrer.id, createdAt: { gt: new Date(input.now.getTime() - MONTH) } } }),
      // Le filleul est-il déjà dans la lignée des parrains du parrain ? (cycle A → B → … → A, même lointain)
      tx.$queryRaw<{ found: boolean }[]>`
        WITH RECURSIVE chain(id, depth) AS (
          SELECT "referredById", 1 FROM "User" WHERE id = ${referrer.id}
          UNION ALL
          SELECT u."referredById", c.depth + 1 FROM "User" u JOIN chain c ON u.id = c.id WHERE c.id IS NOT NULL AND c.depth < 64
        )
        SELECT EXISTS (SELECT 1 FROM chain WHERE id = ${referee.id}) AS found`,
      userFingerprints(tx, referee.id, input.fingerprintKey),
      tx.account.findFirst({ where: { userId: referee.id, provider: "discord" }, select: { providerAccountId: true } }),
      tx.user.findUnique({ where: { id: referrer.id }, select: { referredById: true } }),
    ]);
    if (!account) throw new ReferralV2Error("NO_USER");
    if (existing || account.referredById) throw new ReferralV2Error("ALREADY_REFERRED");
    const since = account.registeredAt ?? account.createdAt;
    if (input.now.getTime() - since.getTime() > input.attachWindowDays * DAY) throw new ReferralV2Error("TOO_LATE");
    // Comme en v1 : un parrain qu'on ne peut pas choisir répond comme un code inconnu
    if (referrer.isGuest || referrer.bannedAt || blocks.byMe || blocks.byThem || cycle[0]?.found) throw new ReferralV2Error("INVALID_CODE");
    if (recent >= input.rules.maxPerMonth) throw new ReferralV2Error("REFERRER_FULL");
    if (await fingerprintTaken(tx, prints)) throw new ReferralV2Error("ALREADY_REFERRED");

    const referral = await tx.referral.create({
      data: {
        referrerId: referrer.id,
        refereeId: referee.id,
        createdAt: input.now,
        version: 2,
        grandReferrerId: grand?.referredById ?? null,
        ennichiEdition: input.ennichiEdition,
        ennichiMultiplier: input.ennichiEdition !== null ? Math.min(10, Math.max(1, input.ennichiMultiplier ?? 1)) : null,
        discordCreatedAt: discord ? snowflakeDate(discord.providerAccountId) : null,
      },
      select: { id: true },
    });
    await tx.user.update({ where: { id: referee.id }, data: { referredById: referrer.id, referredAt: input.now }, select: { id: true } });
    await recordFingerprints(tx, prints, referral.id);
    return { referralId: referral.id, referrerId: referrer.id };
  }, TX);
}
