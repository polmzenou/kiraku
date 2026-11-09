// Vitrines d'un joueur : création, réglages, cartes. Le client Prisma est injecté (serveur ou test).
// Chaque écriture prend le verrou de la ligne User, le même que le recyclage : il ne peut pas
// supprimer un exemplaire qu'on met en vitrine. Le client envoie des ids de Card ; le serveur choisit
// l'exemplaire et vérifie la propriété. Les champs sont écrits un par un, jamais un objet du client.
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { DEFAULT_LAYOUT, isLayoutId, layoutCapacity, MAX_SHOWCASE_CARDS, type ShowcaseLayoutId } from "@/lib/showcase/layouts";
import { addToSlots, fitToCapacity, normalizeShowcase, type ShowcaseSlots } from "@/lib/showcase/slots";
import type { ShowcaseThemeId } from "@/lib/showcase/theme-registry";

export type ShowcaseErrorCode = "NO_USER" | "BANNED" | "INVALID" | "NOT_OWNED" | "NOT_FOUND" | "LIMIT" | "FULL";

export class ShowcaseError extends Error {
  constructor(readonly code: ShowcaseErrorCode) {
    super(code);
  }
}

type Tx = Prisma.TransactionClient;

/** Disposition enregistrée ; une valeur inconnue (base modifiée à la main) vaut la disposition par défaut. */
export function storedLayout(layout: string): ShowcaseLayoutId {
  return isLayoutId(layout) ? layout : DEFAULT_LAYOUT;
}

async function lockOwner(tx: Tx, userId: string): Promise<void> {
  const [user] = await tx.$queryRaw<{ bannedAt: Date | null }[]>`
    SELECT "bannedAt" FROM "User" WHERE id = ${userId} FOR UPDATE`;
  if (!user) throw new ShowcaseError("NO_USER");
  if (user.bannedAt) throw new ShowcaseError("BANNED");
}

async function ownedShowcase(tx: Tx, userId: string, showcaseId: string): Promise<{ id: string; layout: ShowcaseLayoutId }> {
  const showcase = await tx.showcase.findFirst({ where: { id: showcaseId, userId }, select: { id: true, layout: true } });
  if (!showcase) throw new ShowcaseError("NOT_FOUND");
  return { id: showcase.id, layout: storedLayout(showcase.layout) };
}

type Item = { position: number; userCardId: string; cardId: string };

async function readItems(tx: Tx, showcaseId: string): Promise<Item[]> {
  const items = await tx.showcaseItem.findMany({
    where: { showcaseId },
    orderBy: { position: "asc" },
    select: { position: true, userCardId: true, userCard: { select: { cardId: true } } },
  });
  return items.map((i) => ({ position: i.position, userCardId: i.userCardId, cardId: i.userCard.cardId }));
}

function slotsOf(items: readonly Item[], capacity: number): ShowcaseSlots {
  const slots: ShowcaseSlots = Array.from({ length: capacity }, () => null);
  for (const i of items) if (i.position >= 1 && i.position <= capacity) slots[i.position - 1] = i.cardId;
  return slots;
}

/**
 * Exemplaire de chaque carte : celui déjà exposé dans une vitrine du joueur (un exemplaire en combat
 * y reste), sinon le plus ancien en collection. NOT_OWNED si une carte n'en a aucun.
 */
async function pickCopies(tx: Tx, userId: string, cardIds: readonly string[]): Promise<Map<string, string>> {
  if (cardIds.length === 0) return new Map();
  const copies = await tx.userCard.findMany({
    where: {
      ownerId: userId,
      cardId: { in: [...cardIds] },
      OR: [{ status: "COLLECTION" }, { status: "BATTLE", showcaseItems: { some: {} } }],
    },
    orderBy: [{ obtainedAt: "asc" }, { id: "asc" }],
    select: { id: true, cardId: true, _count: { select: { showcaseItems: true } } },
  });
  const chosen = new Map<string, { id: string; shown: boolean }>();
  for (const c of copies) {
    const shown = c._count.showcaseItems > 0;
    const current = chosen.get(c.cardId);
    if (!current || (!current.shown && shown)) chosen.set(c.cardId, { id: c.id, shown });
  }
  if (cardIds.some((id) => !chosen.has(id))) throw new ShowcaseError("NOT_OWNED");
  return new Map([...chosen].map(([cardId, copy]) => [cardId, copy.id]));
}

/** Remplace les cartes d'une vitrine (exemplaires choisis avant d'effacer les anciennes cases). */
async function writeSlots(tx: Tx, userId: string, showcaseId: string, slots: readonly (string | null)[]): Promise<void> {
  const copyOf = await pickCopies(tx, userId, slots.filter((s): s is string => s !== null));
  await tx.showcaseItem.deleteMany({ where: { showcaseId } });
  const rows = slots.flatMap((cardId, i) => (cardId ? [{ showcaseId, position: i + 1, userCardId: copyOf.get(cardId)! }] : []));
  if (rows.length > 0) await tx.showcaseItem.createMany({ data: rows });
}

export type NewShowcase = {
  name: string | null;
  layout: ShowcaseLayoutId;
  theme: ShowcaseThemeId;
  /** Cartes de départ (remplissage automatique), case par case. */
  cards?: readonly (string | null)[];
};

/** Crée une vitrine à la suite des autres ; LIMIT si le joueur en a déjà `max`. Renvoie son id. */
export async function createShowcaseWith(db: PrismaClient, userId: string, input: NewShowcase, max: number): Promise<string> {
  const slots = normalizeShowcase(input.cards ?? [], layoutCapacity(input.layout));
  if (!slots) throw new ShowcaseError("INVALID");
  return db.$transaction(async (tx) => {
    await lockOwner(tx, userId);
    const existing = await tx.showcase.findMany({ where: { userId }, select: { sortOrder: true } });
    if (existing.length >= max) throw new ShowcaseError("LIMIT");
    const sortOrder = existing.reduce((next, s) => Math.max(next, s.sortOrder + 1), 0);
    const { id } = await tx.showcase.create({
      data: { userId, sortOrder, name: input.name, layout: input.layout, theme: input.theme },
      select: { id: true },
    });
    if (slots.some((s) => s !== null)) await writeSlots(tx, userId, id, slots);
    return id;
  });
}

export type ShowcasePatch = { name?: string | null; layout?: ShowcaseLayoutId; theme?: ShowcaseThemeId };

/**
 * Nom, disposition ou thème. Vers une disposition plus petite, les cartes sont resserrées dans leur
 * ordre et les dernières quittent la vitrine. Renvoie les cases après le changement.
 */
export async function updateShowcaseWith(db: PrismaClient, userId: string, showcaseId: string, patch: ShowcasePatch): Promise<ShowcaseSlots> {
  return db.$transaction(async (tx) => {
    await lockOwner(tx, userId);
    const showcase = await ownedShowcase(tx, userId, showcaseId);
    const layout = patch.layout ?? showcase.layout;
    const items = await readItems(tx, showcaseId);
    const before = slotsOf(items, Math.max(MAX_SHOWCASE_CARDS, ...items.map((i) => i.position)));
    const after = fitToCapacity(before, layoutCapacity(layout));
    const moved = items.some((i) => after[i.position - 1] !== i.cardId);
    if (moved) {
      // Mêmes exemplaires, nouvelles positions
      const copyOf = new Map(items.map((i) => [i.cardId, i.userCardId]));
      await tx.showcaseItem.deleteMany({ where: { showcaseId } });
      const rows = after.flatMap((cardId, i) => (cardId ? [{ showcaseId, position: i + 1, userCardId: copyOf.get(cardId)! }] : []));
      if (rows.length > 0) await tx.showcaseItem.createMany({ data: rows });
    }
    await tx.showcase.update({
      where: { id: showcaseId },
      data: {
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.layout !== undefined && { layout: patch.layout }),
        ...(patch.theme !== undefined && { theme: patch.theme }),
      },
      select: { id: true },
    });
    return after;
  });
}

/** Remplace toutes les cartes d'une vitrine (glisser-déposer, carte choisie pour une case). */
export async function setShowcaseCardsWith(
  db: PrismaClient,
  userId: string,
  showcaseId: string,
  slots: readonly (string | null)[],
): Promise<ShowcaseSlots> {
  return db.$transaction(async (tx) => {
    await lockOwner(tx, userId);
    const showcase = await ownedShowcase(tx, userId, showcaseId);
    const wanted = normalizeShowcase(slots, layoutCapacity(showcase.layout));
    if (!wanted) throw new ShowcaseError("INVALID");
    await writeSlots(tx, userId, showcaseId, wanted);
    return wanted;
  });
}

/** Ajoute des cartes dans les premières cases libres ; FULL si la place manque. */
export async function addShowcaseCardsWith(db: PrismaClient, userId: string, showcaseId: string, cardIds: readonly string[]): Promise<ShowcaseSlots> {
  return db.$transaction(async (tx) => {
    await lockOwner(tx, userId);
    const showcase = await ownedShowcase(tx, userId, showcaseId);
    const current = slotsOf(await readItems(tx, showcaseId), layoutCapacity(showcase.layout));
    const next = addToSlots(current, cardIds);
    if (!next) throw new ShowcaseError("FULL");
    if (next.some((s, i) => s !== current[i])) await writeSlots(tx, userId, showcaseId, next);
    return next;
  });
}

/** Retire une carte d'une vitrine. */
export async function removeShowcaseCardWith(db: PrismaClient, userId: string, showcaseId: string, cardId: string): Promise<ShowcaseSlots> {
  return db.$transaction(async (tx) => {
    await lockOwner(tx, userId);
    const showcase = await ownedShowcase(tx, userId, showcaseId);
    await tx.showcaseItem.deleteMany({ where: { showcaseId, userCard: { cardId } } });
    return slotsOf(await readItems(tx, showcaseId), layoutCapacity(showcase.layout));
  });
}

/** Supprime une vitrine ; les suivantes remontent d'un rang. */
export async function deleteShowcaseWith(db: PrismaClient, userId: string, showcaseId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await lockOwner(tx, userId);
    await ownedShowcase(tx, userId, showcaseId);
    await tx.showcase.delete({ where: { id: showcaseId }, select: { id: true } });
    const rest = await tx.showcase.findMany({ where: { userId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, sortOrder: true } });
    for (const [i, s] of rest.entries()) {
      if (s.sortOrder !== i) await tx.showcase.update({ where: { id: s.id }, data: { sortOrder: i }, select: { id: true } });
    }
  });
}

/** Nouvel ordre des vitrines (la première est à l'honneur) ; `ids` doit les contenir toutes, une fois. */
export async function reorderShowcasesWith(db: PrismaClient, userId: string, ids: readonly string[]): Promise<void> {
  await db.$transaction(async (tx) => {
    await lockOwner(tx, userId);
    const existing = await tx.showcase.findMany({ where: { userId }, select: { id: true, sortOrder: true } });
    const known = new Set(existing.map((s) => s.id));
    if (ids.length !== existing.length || new Set(ids).size !== ids.length || ids.some((id) => !known.has(id))) {
      throw new ShowcaseError("INVALID");
    }
    const order = new Map(existing.map((s) => [s.id, s.sortOrder]));
    for (const [i, id] of ids.entries()) {
      if (order.get(id) !== i) await tx.showcase.update({ where: { id }, data: { sortOrder: i }, select: { id: true } });
    }
  });
}
