// Consécration (prestige, étape 16d) : une héritière au plafond, gardée par son propriétaire au moins
// `consecrateMinOwnCycles` prestiges, quitte le jeu pour le sanctuaire de son profil. Irréversible. Client injecté
// (serveur ou tests) ; une seule transaction sous le verrou du joueur.
import type { PrismaClient } from "@/generated/prisma/client";
import { heritageCap } from "@/lib/prestige/heritage";
import { accountRefusal, lockPlayer } from "./prestige-core";

export type ConsecrateErrorCode = "NO_USER" | "GUEST" | "BANNED" | "FROZEN" | "NOT_ELIGIBLE";

export class ConsecrateError extends Error {
  constructor(readonly code: ConsecrateErrorCode) {
    super(code);
  }
}

export type ConsecrateRules = { heritageMax: number; consecrateMinOwnCycles: number };

/** Parcours figé d'un exemplaire consacré : propriétaires successifs et prestiges qui l'ont gardé chez le dernier. */
export type Journey = { owners: { ownerId: string | null; via: string; at: string }[]; cycles: number[]; prestige: number };

const TX = { maxWait: 10_000, timeout: 15_000 };

export async function consecrateWith(
  db: PrismaClient,
  input: { userId: string; userCardId: string; now: Date },
  rules: ConsecrateRules,
): Promise<{ id: string; cardId: string }> {
  const { userId, userCardId, now } = input;
  const heritage = heritageCap(rules);
  return db.$transaction(async (tx) => {
    // Verrou du joueur : un cadeau, une vente ou une mise de cet exemplaire attend la fin de la consécration
    const user = await lockPlayer(tx, userId);
    if (!user) throw new ConsecrateError("NO_USER");
    const refusal = accountRefusal(user);
    if (refusal) throw new ConsecrateError(refusal);

    // Parcours lu avant le déplacement : la provenance part avec la ligne UserCard (cascade)
    const [owners, cycles] = await Promise.all([
      tx.userCardOwner.findMany({ where: { userCardId }, orderBy: [{ at: "asc" }, { id: "asc" }], select: { ownerId: true, via: true, at: true } }),
      tx.$queryRaw<{ number: number }[]>`
        SELECT "number" FROM "PrestigeCycle"
        WHERE "userId" = ${userId} AND "heirs" @> ${JSON.stringify([{ userCardId }])}::jsonb
        ORDER BY "number"`,
    ]);
    const journey: Journey = {
      owners: owners.map((o) => ({ ownerId: o.ownerId, via: o.via, at: o.at.toISOString() })),
      cycles: cycles.map((c) => c.number),
      prestige: user.prestige,
    };

    // Une seule requête déplace l'exemplaire, sous toutes ses conditions : au joueur, en collection, au plafond
    // d'héritage, gardé assez longtemps par lui. Aucune ligne : refus, rien n'a bougé.
    const moved = await tx.$queryRaw<{ id: string; cardId: string }[]>`
      WITH moved AS (
        DELETE FROM "UserCard"
        WHERE id = ${userCardId} AND "ownerId" = ${userId} AND status = 'COLLECTION'
          AND heritage >= ${heritage} AND "keptByOwner" >= ${rules.consecrateMinOwnCycles}
        RETURNING id, "cardId", heritage, printing, serial
      )
      INSERT INTO "ConsecratedCard" (id, "userId", "cardId", heritage, printing, serial, size, journey, "consecratedAt")
      SELECT m.id, ${userId}, m."cardId", m.heritage, m.printing, m.serial, p.size, ${JSON.stringify(journey)}::jsonb, ${now}
      FROM moved m LEFT JOIN "CardPrinting" p ON p."cardId" = m."cardId" AND p.printing = m.printing
      RETURNING id, "cardId"`;
    if (moved.length !== 1) throw new ConsecrateError("NOT_ELIGIBLE");
    return moved[0];
  }, TX);
}
