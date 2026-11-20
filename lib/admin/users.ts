import { z } from "@/lib/zod";
import { MAX_MOVEMENT } from "@/lib/economy/amount";
import { HERITAGE_LEVELS } from "@/lib/prestige/heritage";
import { noteSchema } from "@/lib/text/note-schema";
import { USERNAME_REGEX } from "@/lib/username";
import type { Rarity } from "@/lib/catalog/rarity";

export const ADMIN_USER_PAGE_SIZE = 25;
export const MAX_ADMIN_VALUE = 2_147_483_647;
export const MAX_ADMIN_QUANTITY = 1_000;
export const USER_FILTERS = ["all", "registered", "guests", "admins", "ambassadors", "banned"] as const;
export const USER_STATS = ["boosterStock", "rankPoints", "pityCount", "standardCount"] as const;
export const USER_ADMIN_ACTIONS = [
  "USER_ACCOUNT", "USER_COINS", "USER_STAT", "USER_BOOSTER", "USER_BANNERPITY", "USER_CARD", "USER_COPYHERITAGE", "USER_COPYENGRAVING", "USER_DISCOVERIES", "USER_SESSIONS", "USER_AMBASSADOR", "USER_LEADERBOARD", "USER_LEADERBOARDMALUS", "USER_INCENSE",
  // Bans réseau (server/anticheat/network-ban-core.ts) : pose, levée, ban automatique rendu définitif, ban qui suit l'appareil
  "USER_NETWORK_BAN", "USER_NETWORK_UNBAN", "USER_NETWORK_KEEP", "USER_NETWORK_AUTO",
] as const;
export type UserFilter = (typeof USER_FILTERS)[number];
/** Colonnes triables de la liste des joueurs, et le sens naturel de chacune. */
export const USER_SORTS = ["created", "name", "email", "status", "coins", "cards", "discoveries"] as const;
export type UserSort = (typeof USER_SORTS)[number];
export type SortDir = "asc" | "desc";
export const DEFAULT_USER_DIR: Record<UserSort, SortDir> = {
  created: "desc", name: "asc", email: "asc", status: "asc", coins: "desc", cards: "desc", discoveries: "desc",
};
export type UserStat = (typeof USER_STATS)[number];

const id = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const value = z.number().int().min(0).max(MAX_ADMIN_VALUE);
const mode = z.enum(["SET", "ADD", "REMOVE"]);
const heritage = z.number().int().min(0).max(HERITAGE_LEVELS);
// Bornes de la base : tirage ≥ 1 (prestige.printing.current va jusqu'à 999), taille d'un tirage ≤ 10 000.
// `serial` null : numéro libre tiré au hasard, comme à l'ouverture d'un booster.
export const MAX_PRINTING = 999;
export const MAX_SERIAL = 10_000;
const engraving = z.object({ printing: z.number().int().min(1).max(MAX_PRINTING), serial: z.number().int().min(1).max(MAX_SERIAL).nullable() }).strict();
export type AdminEngraving = z.infer<typeof engraving>;
const base = { userId: id, reason: z.string().trim().min(1).max(300) };

// Une action explicite par section : aucune recopie d'un objet User fourni par le navigateur.
export const adminUserMutationSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("account"), username: z.string().regex(USERNAME_REGEX), role: z.enum(["USER", "DEV", "ADMIN"]), banned: z.boolean(), profileVisibility: z.enum(["PUBLIC", "FRIENDS", "PRIVATE"]), showCollection: z.boolean() }).strict(),
  z.object({ ...base, kind: z.literal("coins"), mode, amount: value }).strict(),
  z.object({ ...base, kind: z.literal("stat"), field: z.enum(USER_STATS), value }).strict(),
  // `message` : mot de l'équipe montré au joueur avec la notification d'un ajout (mode ADD)
  z.object({ ...base, kind: z.literal("booster"), boosterTypeId: id, mode, amount: value, message: noteSchema }).strict(),
  z.object({ ...base, kind: z.literal("bannerPity"), boosterTypeId: id, value }).strict(),
  // Encens disponibles du joueur (SET : valeur finale) ; un ajout est un cadeau de l'équipe
  z.object({ ...base, kind: z.literal("incense"), mode, amount: z.number().int().min(0).max(MAX_ADMIN_QUANTITY), message: noteSchema }).strict(),
  // `heritage` : prestige des exemplaires donnés (0 = ordinaires), ignoré pour un retrait ; plafonné par prestige.heritageMax
  // `engraving` : exemplaires donnés gravés (numéro au hasard, ou choisi pour un seul exemplaire), ignoré pour un retrait
  z.object({
    ...base, kind: z.literal("card"), cardId: id, mode: z.enum(["ADD", "REMOVE"]), amount: z.number().int().min(1).max(MAX_ADMIN_QUANTITY),
    heritage: heritage.optional(), engraving: engraving.nullable().optional(), message: noteSchema,
  }).strict(),
  // Prestige (héritage) d'un exemplaire précis du joueur ; 0 le rend ordinaire, sauf s'il est gravé
  z.object({ ...base, kind: z.literal("copyHeritage"), userCardId: id, heritage }).strict(),
  // Gravure d'un exemplaire précis : posée, changée (nouveau numéro) ou retirée (null). Un numéro quitté ne ressort jamais.
  z.object({ ...base, kind: z.literal("copyEngraving"), userCardId: id, engraving: engraving.nullable() }).strict(),
  z.object({ ...base, kind: z.literal("discoveries"), value: z.number().int().min(0).max(50_000) }).strict(),
  z.object({ ...base, kind: z.literal("sessions") }).strict(),
  // Rôle Ambassadeur : donné ou retiré seulement ici
  z.object({ ...base, kind: z.literal("ambassador"), ambassador: z.boolean() }).strict(),
  z.object({ ...base, kind: z.literal("leaderboard"), hidden: z.boolean() }).strict(),
  // Cartes uniques (`value`) et Mythiques uniques (`mythics`) retirées des totaux affichés dans le classement des collectionneurs
  z.object({ ...base, kind: z.literal("leaderboardMalus"), value: z.number().int().min(0).max(MAX_ADMIN_VALUE), mythics: z.number().int().min(0).max(MAX_ADMIN_VALUE) }).strict(),
]).refine((v) => !(v.kind === "coins" && v.mode !== "SET" && (v.amount < 1 || v.amount > MAX_MOVEMENT)), { message: "Invalid movement" })
  .refine((v) => !((v.kind === "booster" || v.kind === "incense") && v.mode !== "SET" && (v.amount < 1 || v.amount > MAX_ADMIN_QUANTITY)), { message: "Invalid quantity" })
  // Un numéro choisi ne grave qu'un exemplaire
  .refine((v) => !(v.kind === "card" && v.mode === "ADD" && v.engraving?.serial != null && v.amount !== 1), { message: "One copy per chosen serial" });

export type AdminUserMutation = z.infer<typeof adminUserMutationSchema>;
export type AdminUserError =
  | "FORBIDDEN" | "INVALID" | "RATE_LIMITED" | "NOT_FOUND" | "USERNAME_TAKEN" | "SELF_PROTECTED" | "INSUFFICIENT" | "LIMIT" | "CARDS_LOCKED" | "DISCOVERY_MIN"
  // Numéro de gravure déjà sorti, hors du tirage, ou tirage complet
  | "SERIAL_UNAVAILABLE";
export type AdminUserResult = { ok: true } | { ok: false; error: AdminUserError };

export function adjustedValue(current: number, mode: "SET" | "ADD" | "REMOVE", amount: number): number {
  const next = mode === "SET" ? amount : current + (mode === "ADD" ? amount : -amount);
  if (!Number.isSafeInteger(next) || next < 0) throw new Error("INSUFFICIENT");
  if (next > MAX_ADMIN_VALUE) throw new Error("LIMIT");
  return next;
}

export type UserListParams = { query: string; filter: UserFilter; page: number; sort: UserSort; dir: SortDir };

export function parseUserListParams(raw: Record<string, string | string[] | undefined>): UserListParams {
  const query = typeof raw.q === "string" ? raw.q.trim().slice(0, 100) : "";
  const parsed = z.enum(USER_FILTERS).safeParse(raw.filter);
  const page = typeof raw.page === "string" && /^\d{1,5}$/.test(raw.page) ? Math.min(Number(raw.page), 2_000) : 0;
  const sort = z.enum(USER_SORTS).catch("created").parse(raw.sort);
  const dir = z.enum(["asc", "desc"]).catch(DEFAULT_USER_DIR[sort]).parse(raw.dir);
  return { query, filter: parsed.success ? parsed.data : "all", page, sort, dir };
}

/**
 * Paramètres d'URL de la liste, sans les valeurs par défaut. Changer de tri, de filtre ou de
 * recherche revient à la première page.
 */
export function adminUsersQuery(params: UserListParams, patch: Partial<UserListParams> = {}): Record<string, string> {
  const next = { ...params, ...patch };
  if (patch.sort !== undefined || patch.dir !== undefined || patch.filter !== undefined || patch.query !== undefined) {
    next.page = patch.page ?? 0;
  }
  const query: Record<string, string> = {};
  if (next.query) query.q = next.query;
  if (next.filter !== "all") query.filter = next.filter;
  if (next.sort !== "created") query.sort = next.sort;
  if (next.dir !== DEFAULT_USER_DIR[next.sort]) query.dir = next.dir;
  if (next.page > 0) query.page = String(next.page);
  return query;
}

/** Clic sur un en-tête : la colonne déjà triée change de sens, une autre part dans son sens naturel. */
export function sortToggle(params: Pick<UserListParams, "sort" | "dir">, sort: UserSort): { sort: UserSort; dir: SortDir } {
  if (params.sort !== sort) return { sort, dir: DEFAULT_USER_DIR[sort] };
  return { sort, dir: params.dir === "asc" ? "desc" : "asc" };
}

export type AdminCardCandidate = {
  id: string; anilistId: number; name: string; imageUrl: string; rarity: Rarity; series: string; rank: number | null;
};

/** Exemplaire du joueur pour la carte ouverte dans sa fiche admin (prestige modifiable un par un). */
export type AdminUserCopy = {
  id: string; status: "COLLECTION" | "AUCTION" | "BATTLE" | "EXPEDITION" | "CASINO"; heritage: number; keptByOwner: number; printing: number | null; serial: number | null; size: number | null; obtainedAt: Date;
};

/** Tirage gravé d'une carte (compteur CardPrinting) : taille figée et numéros déjà sortis, qui ne ressortent jamais. */
export type AdminPrinting = { printing: number; size: number; taken: number[] };
