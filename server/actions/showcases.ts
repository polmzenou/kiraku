"use server";

import { getLocale } from "next-intl/server";
import { refresh } from "next/cache";
import { z } from "@/lib/zod";
import { rarityKeySchema } from "@/lib/catalog/definitions";
import { referencedSeries } from "@/lib/profile/conditions";
import { LAYOUT_IDS, layoutCapacity, MAX_SHOWCASE_CARDS } from "@/lib/showcase/layouts";
import { cleanShowcaseName, SHOWCASE_NAME_MAX } from "@/lib/showcase/name";
import type { ShowcaseCard } from "@/lib/collection/view";
import type { ShowcaseSlots } from "@/lib/showcase/slots";
import { THEME_IDS, type ShowcaseThemeId, type ThemeChoice } from "@/lib/showcase/theme-registry";
import { themeChoice, themeChoices, themeConditions, themeConfig } from "@/lib/showcase/themes";
import { prisma } from "../db";
import { getProfileStats } from "../profile/progress";
import { rateLimit } from "../ratelimit";
import { getSetting } from "../settings";
import { autofillCards } from "../showcase/autofill";
import {
  addShowcaseCardsWith,
  createShowcaseWith,
  deleteShowcaseWith,
  removeShowcaseCardWith,
  reorderShowcasesWith,
  setShowcaseCardsWith,
  ShowcaseError,
  storedLayout,
  updateShowcaseWith,
} from "../showcase/core";
import { getShowcaseCards, listShowcases } from "../showcase/queries";
import { requireActiveUser } from "../user";

// Vitrines du joueur. Ordre des contrôles : session (compte actif) → Zod → rate limit → propriété,
// vérifiée sous verrou par server/showcase/core.ts. Le client n'envoie que des ids et des intentions.

export type ShowcaseActionError =
  | "NO_SESSION"
  | "INVALID"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "NOT_OWNED"
  | "NOT_FOUND"
  | "LIMIT"
  | "FULL"
  | "THEME_LOCKED";

type Failure = { ok: false; error: ShowcaseActionError };
export type SlotsResult = { ok: true; slots: ShowcaseSlots } | Failure;

const idSchema = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const nameSchema = z.string().max(SHOWCASE_NAME_MAX * 4);
const layoutSchema = z.enum(LAYOUT_IDS);
const themeSchema = z.enum(THEME_IDS);

type Bucket = "structure" | "cards";
// Réglages et vitrines : peu fréquents ; cartes : glisser-déposer, enregistré par lots côté client
const LIMITS: Record<Bucket, { key: string; limit: number }> = {
  structure: { key: "showcase", limit: 20 },
  cards: { key: "showcase-items", limit: 40 },
};

async function guard<T>(input: unknown, schema: z.ZodType<T>, bucket: Bucket) {
  const user = await requireActiveUser();
  if (!user) return { error: "NO_SESSION" as const };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "INVALID" as const };
  const { key, limit } = LIMITS[bucket];
  if (!(await rateLimit(`${key}:${user.id}`, { limit, windowSeconds: 60 })).success) return { error: "RATE_LIMITED" as const };
  return { userId: user.id, data: parsed.data };
}

function failure(e: unknown): Failure {
  if (e instanceof ShowcaseError) {
    switch (e.code) {
      case "INVALID":
      case "NOT_OWNED":
      case "NOT_FOUND":
      case "LIMIT":
      case "FULL":
        return { ok: false, error: e.code };
      default:
        return { ok: false, error: "UNAVAILABLE" };
    }
  }
  console.error("[vitrines] action impossible", e);
  return { ok: false, error: "UNAVAILABLE" };
}

/** Le joueur peut-il choisir ce thème maintenant (statut réglé dans l'admin et condition remplie) ? */
async function themeAllowed(userId: string, theme: ShowcaseThemeId): Promise<boolean> {
  const setting = await getSetting("showcase.themes");
  const config = themeConfig(setting, theme);
  if (config.status !== "AVAILABLE") return false;
  if (config.condition.type === "ALWAYS") return true;
  const stats = await getProfileStats(userId, referencedSeries([config.condition]));
  return themeChoice(theme, setting, stats)?.state === "available";
}

// --- Vitrines ---

const createSchema = z
  .object({
    name: nameSchema,
    layout: layoutSchema,
    theme: themeSchema,
    autofill: z.object({ series: idSchema.nullable(), minRarity: rarityKeySchema.nullable() }).strict().nullable(),
  })
  .strict();

/** Nouvelle vitrine, à la suite des autres, éventuellement remplie avec les meilleures cartes. */
export async function createShowcaseAction(input: unknown): Promise<{ ok: true; id: string } | Failure> {
  const g = await guard(input, createSchema, "structure");
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  const name = cleanShowcaseName(g.data.name);
  if (name === undefined) return { ok: false, error: "INVALID" };
  if (!(await themeAllowed(g.userId, g.data.theme))) return { ok: false, error: "THEME_LOCKED" };
  try {
    const cards = g.data.autofill ? await autofillCards(g.userId, layoutCapacity(g.data.layout), g.data.autofill) : undefined;
    const id = await createShowcaseWith(
      prisma,
      g.userId,
      { name, layout: g.data.layout, theme: g.data.theme, cards },
      await getSetting("showcase.maxPerPlayer"),
    );
    refresh();
    return { ok: true, id };
  } catch (e) {
    return failure(e);
  }
}

const updateSchema = z
  .object({ showcaseId: idSchema, name: nameSchema.optional(), layout: layoutSchema.optional(), theme: themeSchema.optional() })
  .strict();

/** Nom, disposition ou thème d'une vitrine. Renvoie ses cases (resserrées si la disposition rétrécit). */
export async function updateShowcaseAction(input: unknown): Promise<SlotsResult> {
  const g = await guard(input, updateSchema, "structure");
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  const { showcaseId, layout, theme } = g.data;
  const name = g.data.name === undefined ? undefined : cleanShowcaseName(g.data.name);
  if (g.data.name !== undefined && name === undefined) return { ok: false, error: "INVALID" };
  if (theme !== undefined) {
    // Le thème déjà posé reste acquis : la condition ne se revérifie que pour en choisir un autre
    const current = await prisma.showcase.findFirst({ where: { id: showcaseId, userId: g.userId }, select: { theme: true } });
    if (!current) return { ok: false, error: "NOT_FOUND" };
    if (current.theme !== theme && !(await themeAllowed(g.userId, theme))) return { ok: false, error: "THEME_LOCKED" };
  }
  try {
    const slots = await updateShowcaseWith(prisma, g.userId, showcaseId, { name, layout, theme });
    refresh();
    return { ok: true, slots };
  } catch (e) {
    return failure(e);
  }
}

const deleteSchema = z.object({ showcaseId: idSchema }).strict();

export async function deleteShowcaseAction(input: unknown): Promise<{ ok: true } | Failure> {
  const g = await guard(input, deleteSchema, "structure");
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  try {
    await deleteShowcaseWith(prisma, g.userId, g.data.showcaseId);
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

const reorderSchema = z.object({ ids: z.array(idSchema).min(1).max(20) }).strict();

/** Nouvel ordre des vitrines ; la première passe à l'honneur sur le profil. */
export async function reorderShowcasesAction(input: unknown): Promise<{ ok: true } | Failure> {
  const g = await guard(input, reorderSchema, "structure");
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  try {
    await reorderShowcasesWith(prisma, g.userId, g.data.ids);
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

// --- Cartes d'une vitrine ---

const cardIdSchema = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const setCardsSchema = z.object({ showcaseId: idSchema, slots: z.array(cardIdSchema.nullable()).max(MAX_SHOWCASE_CARDS) }).strict();
const addCardsSchema = z.object({ showcaseId: idSchema, cardIds: z.array(cardIdSchema).min(1).max(MAX_SHOWCASE_CARDS) }).strict();
const cardSchema = z.object({ showcaseId: idSchema, cardId: cardIdSchema }).strict();

/** Remplace toutes les cartes d'une vitrine (ordre après un glisser-déposer, carte choisie pour une case). */
export async function setShowcaseCardsAction(input: unknown): Promise<SlotsResult> {
  const g = await guard(input, setCardsSchema, "cards");
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  try {
    const slots = await setShowcaseCardsWith(prisma, g.userId, g.data.showcaseId, g.data.slots);
    refresh();
    return { ok: true, slots };
  } catch (e) {
    return failure(e);
  }
}

/** Ajoute des cartes dans les premières cases libres (choix multiple, fiche carte). */
export async function addShowcaseCardsAction(input: unknown): Promise<SlotsResult> {
  const g = await guard(input, addCardsSchema, "cards");
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  try {
    const slots = await addShowcaseCardsWith(prisma, g.userId, g.data.showcaseId, g.data.cardIds);
    refresh();
    return { ok: true, slots };
  } catch (e) {
    return failure(e);
  }
}

export async function removeShowcaseCardAction(input: unknown): Promise<SlotsResult> {
  const g = await guard(input, cardSchema, "cards");
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  try {
    const slots = await removeShowcaseCardWith(prisma, g.userId, g.data.showcaseId, g.data.cardId);
    refresh();
    return { ok: true, slots };
  } catch (e) {
    return failure(e);
  }
}

const fillSchema = z.object({ showcaseId: idSchema, minRarity: rarityKeySchema.nullable() }).strict();

/**
 * « Remplir » : les cases libres reçoivent les meilleures cartes du joueur qui n'y sont pas encore.
 * Renvoie les cartes de la vitrine (le client n'a pas les données des cartes ajoutées).
 */
export async function fillShowcaseAction(input: unknown): Promise<{ ok: true; added: number; cards: (ShowcaseCard | null)[] } | Failure> {
  const g = await guard(input, fillSchema, "cards");
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  const showcase = await prisma.showcase.findFirst({
    where: { id: g.data.showcaseId, userId: g.userId },
    select: { layout: true, items: { select: { userCard: { select: { cardId: true } } } } },
  });
  if (!showcase) return { ok: false, error: "NOT_FOUND" };
  const layout = storedLayout(showcase.layout);
  const capacity = layoutCapacity(layout);
  const present = new Set(showcase.items.map((i) => i.userCard.cardId));
  const free = capacity - present.size;
  try {
    const best = await autofillCards(g.userId, capacity + present.size, { series: null, minRarity: g.data.minRarity });
    const picked = best.filter((id): id is string => id !== null && !present.has(id)).slice(0, Math.max(0, free));
    if (picked.length > 0) await addShowcaseCardsWith(prisma, g.userId, g.data.showcaseId, picked);
    const cards = await getShowcaseCards(g.data.showcaseId, g.userId, layout, await getLocale());
    if (picked.length > 0) refresh();
    return { ok: true, added: picked.length, cards };
  } catch (e) {
    return failure(e);
  }
}

export type CardShowcaseOption = { id: string; name: string | null; count: number; capacity: number; hasCard: boolean };

const cardOnlySchema = z.object({ cardId: cardIdSchema }).strict();

/** Vitrines du joueur pour la fiche d'une carte : celles qui la contiennent, et la place restante. */
export async function showcasesForCardAction(input: unknown): Promise<{ ok: true; showcases: CardShowcaseOption[] } | Failure> {
  const g = await guard(input, cardOnlySchema, "cards");
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  const [summaries, containing] = await Promise.all([
    listShowcases(g.userId),
    prisma.showcaseItem.findMany({
      where: { showcase: { userId: g.userId }, userCard: { ownerId: g.userId, cardId: g.data.cardId } },
      select: { showcaseId: true },
    }),
  ]);
  const has = new Set(containing.map((c) => c.showcaseId));
  return {
    ok: true,
    showcases: summaries.map((s) => ({ id: s.id, name: s.name, count: s.count, capacity: layoutCapacity(s.layout), hasCard: has.has(s.id) })),
  };
}

const noInputSchema = z.object({}).strict();

/** Thèmes proposés au joueur (création, mode édition) : disponibles, verrouillés avec leur progression, bientôt. */
export async function myThemeChoicesAction(input: unknown): Promise<{ ok: true; themes: ThemeChoice[] } | Failure> {
  const g = await guard(input, noInputSchema, "cards");
  if ("error" in g) return { ok: false, error: g.error ?? "INVALID" };
  const setting = await getSetting("showcase.themes");
  const stats = await getProfileStats(g.userId, referencedSeries(themeConditions(setting)));
  return { ok: true, themes: themeChoices(setting, stats) };
}
