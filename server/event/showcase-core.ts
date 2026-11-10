// Event vitrines : inscriptions, votes et modération. Le client Prisma est injecté (serveur ou test).
// Chaque écriture se fait dans une transaction qui reprend le verrou de la ligne User du joueur (le même
// que les vitrines et le recyclage) et revérifie le compte : invité, banni ou gelé n'écrivent rien.
// L'action a déjà vérifié que l'event est allumé et en cours ; elle transmet l'édition et la phase.
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { isFrozen } from "@/lib/account/deletion";
import { entrySnapshot, parseEntryCards, voteError, type ShowcaseEventPhase } from "@/lib/event/showcase";
import { effectiveTheme, type ThemesSetting } from "@/lib/showcase/themes";
import { writeAdminLog } from "../admin/log";
import { storedLayout } from "../showcase/core";

export type ShowcaseEventErrorCode =
  | "NO_USER"
  | "GUEST"
  | "UNAVAILABLE"
  | "CLOSED"
  | "NOT_FOUND"
  | "TOO_FEW_CARDS"
  | "ALREADY_ENTERED"
  | "OWN_ENTRY";

export class ShowcaseEventError extends Error {
  constructor(readonly code: ShowcaseEventErrorCode) {
    super(code);
  }
}

type Tx = Prisma.TransactionClient;
type Db = PrismaClient;

/** Verrouille le joueur et vérifie qu'il peut jouer : inscrit, non banni, compte non gelé. */
async function lockPlayer(tx: Tx, userId: string): Promise<void> {
  const [user] = await tx.$queryRaw<{ isGuest: boolean; bannedAt: Date | null; deletionRequestedAt: Date | null; anonymizedAt: Date | null }[]>`
    SELECT "isGuest", "bannedAt", "deletionRequestedAt", "anonymizedAt" FROM "User" WHERE id = ${userId} FOR UPDATE`;
  if (!user) throw new ShowcaseEventError("NO_USER");
  if (user.isGuest) throw new ShowcaseEventError("GUEST");
  if (user.bannedAt || isFrozen(user)) throw new ShowcaseEventError("UNAVAILABLE");
}

const isKnown = (e: unknown, code: string) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === code;

/**
 * Inscrit une vitrine du joueur : photo figée de ses cases (exemplaires encore à lui, ids de Card), de sa
 * disposition, de son nom et de son thème affiché. Une seule inscription par édition.
 */
export async function enterShowcaseEventWith(
  db: Db,
  input: { userId: string; showcaseId: string; edition: string; minCards: number; themes: ThemesSetting },
): Promise<{ id: string }> {
  try {
    return await db.$transaction(async (tx) => {
      await lockPlayer(tx, input.userId);
      const showcase = await tx.showcase.findFirst({
        where: { id: input.showcaseId, userId: input.userId },
        select: {
          id: true,
          name: true,
          layout: true,
          theme: true,
          items: { where: { userCard: { ownerId: input.userId } }, select: { position: true, userCard: { select: { cardId: true } } } },
        },
      });
      if (!showcase) throw new ShowcaseEventError("NOT_FOUND");
      const layout = storedLayout(showcase.layout);
      const snapshot = entrySnapshot(
        showcase.items.map((i) => ({ position: i.position, cardId: i.userCard.cardId })),
        layout,
        input.minCards,
      );
      if (!snapshot.ok) throw new ShowcaseEventError(snapshot.error);
      const existing = await tx.showcaseEventEntry.findUnique({ where: { edition_userId: { edition: input.edition, userId: input.userId } }, select: { id: true } });
      if (existing) throw new ShowcaseEventError("ALREADY_ENTERED");
      const entry = await tx.showcaseEventEntry.create({
        data: {
          edition: input.edition,
          userId: input.userId,
          showcaseId: showcase.id,
          name: showcase.name,
          layout,
          theme: effectiveTheme(showcase.theme, input.themes),
          cards: snapshot.cards,
        },
        select: { id: true },
      });
      return { id: entry.id };
    });
  } catch (e) {
    // Deux inscriptions simultanées : la contrainte unique (édition, joueur) tranche
    if (isKnown(e, "P2002")) throw new ShowcaseEventError("ALREADY_ENTERED");
    throw e;
  }
}

/** Retire l'inscription du joueur ; ses votes reçus partent avec elle (cascade). Il peut se réinscrire. */
export async function withdrawShowcaseEntryWith(db: Db, input: { userId: string; edition: string }): Promise<void> {
  await db.$transaction(async (tx) => {
    await lockPlayer(tx, input.userId);
    const { count } = await tx.showcaseEventEntry.deleteMany({ where: { edition: input.edition, userId: input.userId } });
    if (count === 0) throw new ShowcaseEventError("NOT_FOUND");
  });
}

/**
 * Vote pour une inscription (un seul vote par joueur et par édition, remplacé s'il change d'avis). Jamais
 * pour sa propre vitrine, ni pour celle d'un compte banni ou gelé.
 */
export async function voteShowcaseEntryWith(
  db: Db,
  input: { voterId: string; edition: string; entryId: string; enabled: boolean; phase: ShowcaseEventPhase | null },
): Promise<void> {
  try {
    await db.$transaction(async (tx) => {
      await lockPlayer(tx, input.voterId);
      const entry = await tx.showcaseEventEntry.findUnique({
        where: { id: input.entryId },
        select: { edition: true, userId: true, user: { select: { bannedAt: true, deletionRequestedAt: true, anonymizedAt: true } } },
      });
      const error = voteError({ enabled: input.enabled, phase: input.phase, edition: input.edition, entry, voterId: input.voterId });
      if (error) throw new ShowcaseEventError(error);
      if (entry!.user.bannedAt || isFrozen(entry!.user)) throw new ShowcaseEventError("NOT_FOUND");
      const key = { edition_voterId: { edition: input.edition, voterId: input.voterId } };
      const current = await tx.showcaseEventVote.findUnique({ where: key, select: { entryId: true } });
      // Même vitrine : rien ne change (l'heure du vote départage les égalités)
      if (current?.entryId === input.entryId) return;
      await tx.showcaseEventVote.upsert({
        where: key,
        create: { edition: input.edition, voterId: input.voterId, entryId: input.entryId },
        update: { entryId: input.entryId },
      });
    });
  } catch (e) {
    // Inscription retirée entre la lecture et l'écriture
    if (isKnown(e, "P2003") || isKnown(e, "P2025")) throw new ShowcaseEventError("NOT_FOUND");
    throw e;
  }
}

/** Retire le vote du joueur pour cette édition (rien à faire s'il n'en a pas). */
export async function clearShowcaseVoteWith(db: Db, input: { voterId: string; edition: string }): Promise<void> {
  await db.$transaction(async (tx) => {
    await lockPlayer(tx, input.voterId);
    await tx.showcaseEventVote.deleteMany({ where: { edition: input.edition, voterId: input.voterId } });
  });
}

/** Modération : l'admin retire une inscription (et ses votes), avec une ligne AdminLog. */
export async function removeShowcaseEntryByAdminWith(db: Db, input: { adminId: string; entryId: string }): Promise<void> {
  await db.$transaction(async (tx) => {
    const entry = await tx.showcaseEventEntry.findUnique({
      where: { id: input.entryId },
      select: { id: true, edition: true, userId: true, name: true, layout: true, theme: true, cards: true, createdAt: true, _count: { select: { votes: true } } },
    });
    if (!entry) throw new ShowcaseEventError("NOT_FOUND");
    await tx.showcaseEventEntry.delete({ where: { id: entry.id } });
    await writeAdminLog(tx, {
      adminId: input.adminId,
      action: "SHOWCASE_EVENT_ENTRY_REMOVE",
      targetType: "ShowcaseEventEntry",
      targetId: entry.id,
      before: {
        edition: entry.edition,
        userId: entry.userId,
        name: entry.name,
        layout: entry.layout,
        theme: entry.theme,
        cards: parseEntryCards(entry.cards),
        votes: entry._count.votes,
        createdAt: entry.createdAt.toISOString(),
      },
    });
  });
}
