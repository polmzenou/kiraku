import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { LotInput } from "@/lib/economy/lots";
import { writeAdminLog } from "../admin/log";

// Enregistrement d'un lot, partagé par /admin/lots (admin) et /admin/parrainage/lots (toute l'équipe, lots du
// parrainage et de l'Ennichi) : références vérifiées, contenu remplacé d'un bloc, une ligne AdminLog (avant / après).
// Chaque champ écrit est choisi un par un, jamais l'objet reçu.

export class LotSaveError extends Error {
  constructor(readonly code: "NOT_FOUND") {
    super(code);
  }
}

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/** Types de boosters et cartes cités par le lot : tous doivent exister. */
export async function lotRefsExist(db: PrismaClient, items: LotInput["items"]): Promise<boolean> {
  const typeIds = [...new Set(items.flatMap((i) => (i.kind === "BOOSTER" ? [i.boosterTypeId] : [])))];
  const cardIds = [...new Set(items.flatMap((i) => (i.kind === "CARD" ? [i.cardId] : [])))];
  const [types, cards] = await Promise.all([
    typeIds.length ? db.boosterType.count({ where: { id: { in: typeIds } } }) : 0,
    cardIds.length ? db.card.count({ where: { id: { in: cardIds } } }) : 0,
  ]);
  return types === typeIds.length && cards === cardIds.length;
}

/**
 * Crée ou modifie un lot et renvoie son id. Pour un lot existant, `check` est relu dans la transaction avant toute
 * écriture (droit du DEV sur les lots du parrainage) et refuse en levant sa propre erreur.
 */
export async function writeLotWith(
  db: PrismaClient,
  v: LotInput,
  opts: { staffId: string; actions: { create: string; update: string }; check?: (tx: Prisma.TransactionClient, lotId: string) => Promise<void> },
): Promise<string> {
  const items = v.items.map((i) => ({
    kind: i.kind,
    boosterTypeId: i.kind === "BOOSTER" ? i.boosterTypeId : null,
    cardId: i.kind === "CARD" ? i.cardId : null,
    rarity: i.kind === "RARITY_CARD" ? i.rarity : null,
    quantity: i.quantity,
  }));
  const data = { name: { fr: v.name.fr, en: v.name.en }, zeni: v.zeni, active: v.active };

  return db.$transaction(async (tx) => {
    const before = v.id ? await tx.lot.findUnique({ where: { id: v.id }, include: { items: true } }) : null;
    if (v.id && !before) throw new LotSaveError("NOT_FOUND");
    if (before && opts.check) await opts.check(tx, before.id);
    const lot = before ? await tx.lot.update({ where: { id: before.id }, data }) : await tx.lot.create({ data });
    // Le contenu est remplacé d'un bloc : un lot déjà versé ne change rien à ce qui a été reçu
    await tx.lotItem.deleteMany({ where: { lotId: lot.id } });
    if (items.length) await tx.lotItem.createMany({ data: items.map((i) => ({ ...i, lotId: lot.id })) });
    await writeAdminLog(tx, {
      adminId: opts.staffId,
      action: before ? opts.actions.update : opts.actions.create,
      targetType: "Lot",
      targetId: lot.id,
      before: before ? json(before) : undefined,
      after: json({ ...data, items }),
    });
    return lot.id;
  });
}
