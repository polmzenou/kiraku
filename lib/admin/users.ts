import { z } from "zod";
import { MAX_MOVEMENT } from "@/lib/economy/amount";
import { USERNAME_REGEX } from "@/lib/username";
import type { Rarity } from "@/lib/catalog/rarity";

export const ADMIN_USER_PAGE_SIZE = 25;
export const MAX_ADMIN_VALUE = 2_147_483_647;
export const MAX_ADMIN_QUANTITY = 1_000;
export const USER_FILTERS = ["all", "registered", "guests", "admins", "banned"] as const;
export const USER_STATS = ["boosterStock", "rankPoints", "pityCount", "standardCount"] as const;
export const USER_ADMIN_ACTIONS = ["USER_ACCOUNT", "USER_COINS", "USER_STAT", "USER_BOOSTER", "USER_BANNERPITY", "USER_CARD", "USER_DISCOVERIES", "USER_SESSIONS"] as const;
export type UserFilter = (typeof USER_FILTERS)[number];
export type UserStat = (typeof USER_STATS)[number];

const id = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const value = z.number().int().min(0).max(MAX_ADMIN_VALUE);
const mode = z.enum(["SET", "ADD", "REMOVE"]);
const base = { userId: id, reason: z.string().trim().min(1).max(300) };

// Une action explicite par section : aucune recopie d'un objet User fourni par le navigateur.
export const adminUserMutationSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("account"), username: z.string().regex(USERNAME_REGEX), role: z.enum(["USER", "ADMIN"]), banned: z.boolean(), profileVisibility: z.enum(["PUBLIC", "FRIENDS", "PRIVATE"]), showCollection: z.boolean() }).strict(),
  z.object({ ...base, kind: z.literal("coins"), mode, amount: value }).strict(),
  z.object({ ...base, kind: z.literal("stat"), field: z.enum(USER_STATS), value }).strict(),
  z.object({ ...base, kind: z.literal("booster"), boosterTypeId: id, mode, amount: value }).strict(),
  z.object({ ...base, kind: z.literal("bannerPity"), boosterTypeId: id, value }).strict(),
  z.object({ ...base, kind: z.literal("card"), cardId: id, mode: z.enum(["ADD", "REMOVE"]), amount: z.number().int().min(1).max(MAX_ADMIN_QUANTITY) }).strict(),
  z.object({ ...base, kind: z.literal("discoveries"), value: z.number().int().min(0).max(50_000) }).strict(),
  z.object({ ...base, kind: z.literal("sessions") }).strict(),
]).refine((v) => !(v.kind === "coins" && v.mode !== "SET" && (v.amount < 1 || v.amount > MAX_MOVEMENT)), { message: "Invalid movement" })
  .refine((v) => !(v.kind === "booster" && v.mode !== "SET" && (v.amount < 1 || v.amount > MAX_ADMIN_QUANTITY)), { message: "Invalid quantity" });

export type AdminUserMutation = z.infer<typeof adminUserMutationSchema>;
export type AdminUserError = "FORBIDDEN" | "INVALID" | "RATE_LIMITED" | "NOT_FOUND" | "USERNAME_TAKEN" | "SELF_PROTECTED" | "INSUFFICIENT" | "LIMIT" | "CARDS_LOCKED" | "DISCOVERY_MIN";
export type AdminUserResult = { ok: true } | { ok: false; error: AdminUserError };

export function adjustedValue(current: number, mode: "SET" | "ADD" | "REMOVE", amount: number): number {
  const next = mode === "SET" ? amount : current + (mode === "ADD" ? amount : -amount);
  if (!Number.isSafeInteger(next) || next < 0) throw new Error("INSUFFICIENT");
  if (next > MAX_ADMIN_VALUE) throw new Error("LIMIT");
  return next;
}

export function parseUserListParams(raw: Record<string, string | string[] | undefined>) {
  const query = typeof raw.q === "string" ? raw.q.trim().slice(0, 100) : "";
  const parsed = z.enum(USER_FILTERS).safeParse(raw.filter);
  const page = typeof raw.page === "string" && /^\d{1,5}$/.test(raw.page) ? Math.min(Number(raw.page), 2_000) : 0;
  return { query, filter: parsed.success ? parsed.data : "all" as UserFilter, page };
}

export type AdminCardCandidate = {
  id: string; anilistId: number; name: string; imageUrl: string; rarity: Rarity; series: string; rank: number | null;
};
