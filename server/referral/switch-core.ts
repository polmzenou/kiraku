import type { PrismaClient } from "@/generated/prisma/client";
import { snowflakeDate } from "@/lib/discord/snowflake";
import { recordFingerprints, userFingerprints } from "./fingerprint";

// Bascule vers le parrainage v2, au lancement, idempotente (relancée, elle ne change plus rien) :
//   - les parrainages v1 en attente deviennent des v2 : fenêtres comptées depuis leur rattachement, l'étape 1 tombe et
//     paie au prochain avancement (ouverture d'un booster, visite de /parrainage, cron horaire) ;
//   - l'empreinte de chaque filleul existant est gardée : un compte Discord ou une boîte e-mail déjà filleul ne l'est
//     plus jamais, même après une suppression de compte.
// Les v1 qualifiés restent en v1 : ils comptent comme installés (step2At, posé par la migration) et leur lot v1 non
// réclamé reste réclamable.

export async function switchToReferralV2With(db: PrismaClient, input: { key: Buffer }): Promise<{ converted: number; fingerprinted: number }> {
  const pending = await db.referral.findMany({ where: { version: 1, status: "PENDING" }, select: { id: true, referrerId: true, refereeId: true, createdAt: true } });
  let converted = 0;
  for (const r of pending) {
    const moved = await db.$transaction(async (tx) => {
      const [grand, discord] = await Promise.all([
        tx.user.findUnique({ where: { id: r.referrerId }, select: { referredById: true } }),
        tx.account.findFirst({ where: { userId: r.refereeId, provider: "discord" }, select: { providerAccountId: true } }),
      ]);
      const updated = await tx.referral.updateMany({
        where: { id: r.id, version: 1, status: "PENDING" },
        data: { version: 2, grandReferrerId: grand?.referredById ?? null, discordCreatedAt: discord ? snowflakeDate(discord.providerAccountId) : null },
      });
      if (updated.count === 1) await tx.user.updateMany({ where: { id: r.refereeId, referredAt: null }, data: { referredAt: r.createdAt } });
      return updated.count === 1;
    });
    if (moved) converted++;
  }

  let fingerprinted = 0;
  const all = await db.referral.findMany({ select: { id: true, refereeId: true } });
  for (const r of all) {
    const prints = await userFingerprints(db, r.refereeId, input.key);
    if (prints.length === 0) continue;
    await db.$transaction((tx) => recordFingerprints(tx, prints, r.id));
    fingerprinted++;
  }
  return { converted, fingerprinted };
}
