"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { z } from "@/lib/zod";
import { Prisma } from "@/generated/prisma/client";
import { ANONYMIZED_PREFIX, confirmsUsername, isFrozen } from "@/lib/account/deletion";
import { USERNAME_REGEX } from "@/lib/username";
import { AccountError, cancelDeletionWith, requestDeletionWith } from "../account/account-core";
import { prisma } from "../db";
import { currentTermsVersion } from "../legal";
import { rateLimit } from "../ratelimit";
import { SESSION_COOKIE } from "../session";
import { getSetting } from "../settings";
import { getCurrentUser } from "../user";

// Droits du joueur sur ses données (onglet « Mes données » du Compte) et acceptation des CGU.
// Ordre des contrôles : session → Zod → propriété (toujours le joueur de la session) → rate limit.

export type DataActionError =
  | "NO_SESSION"
  | "INVALID"
  | "RATE_LIMITED"
  | "STALE"
  | "CONFIRM_MISMATCH"
  | "ALREADY_REQUESTED"
  | "NOT_REQUESTED"
  | "FROZEN"
  | "GUEST"
  | "BANNED"
  | "USERNAME_TAKEN"
  | "TOO_SOON";

type Result = { ok: true } | { ok: false; error: DataActionError };

const HOUR = 3600;

// --- CGU ---

const acceptSchema = z.object({ version: z.number().int().min(1).max(10_000) });

/** Accepte la version des CGU exigée (celle affichée à l'écran, sinon STALE : la page se recharge). */
export async function acceptTermsAction(input: unknown): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  const parsed = acceptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`terms:${user.id}`, { limit: 10, windowSeconds: HOUR })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  const required = await getSetting("legal.termsRequiredVersion");
  if (parsed.data.version !== required) return { ok: false, error: "STALE" };
  await prisma.user.update({ where: { id: user.id }, data: { termsVersion: await currentTermsVersion(required) } });
  refresh();
  return { ok: true };
}

// --- Suppression du compte ---

const deletionSchema = z.object({ confirm: z.string().max(40) });

export async function requestDeletionAction(input: unknown): Promise<Result | { ok: true; dueAt: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  const parsed = deletionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!confirmsUsername(parsed.data.confirm, user.username)) return { ok: false, error: "CONFIRM_MISMATCH" };
  if (!(await rateLimit(`deletion:${user.id}`, { limit: 5, windowSeconds: 24 * HOUR })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  const graceDays = await getSetting("account.deletionGraceDays");
  const keepSessionToken = (await cookies()).get(SESSION_COOKIE.name)?.value ?? null;
  try {
    const { dueAt } = await requestDeletionWith(prisma, { userId: user.id, now: new Date(), graceDays, keepSessionToken });
    refresh();
    return { ok: true, dueAt: dueAt.toISOString() };
  } catch (e) {
    if (e instanceof AccountError) {
      return { ok: false, error: e.code === "ALREADY_REQUESTED" ? "ALREADY_REQUESTED" : "FROZEN" };
    }
    throw e;
  }
}

export async function cancelDeletionAction(): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  if (!(await rateLimit(`deletion:${user.id}`, { limit: 5, windowSeconds: 24 * HOUR })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  try {
    await cancelDeletionWith(prisma, { userId: user.id, now: new Date() });
    refresh();
    return { ok: true };
  } catch (e) {
    if (e instanceof AccountError) return { ok: false, error: e.code === "NOT_REQUESTED" ? "NOT_REQUESTED" : "FROZEN" };
    throw e;
  }
}

// --- Rectification : pseudo et langue ---

const usernameSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(USERNAME_REGEX)
    .refine((u) => !u.toLowerCase().startsWith(ANONYMIZED_PREFIX)),
});

const DAY_MS = 86_400_000;

export async function changeUsernameAction(input: unknown): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  if (user.isGuest) return { ok: false, error: "GUEST" };
  if (user.bannedAt) return { ok: false, error: "BANNED" };
  if (isFrozen(user)) return { ok: false, error: "FROZEN" };
  const parsed = usernameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`username:${user.id}`, { limit: 5, windowSeconds: HOUR })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  const { username } = parsed.data;
  if (username === user.username) return { ok: true };
  const cooldownDays = await getSetting("account.usernameChangeDays");
  const now = new Date();

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const taken = await tx.user.findFirst({
        where: { username: { equals: username, mode: "insensitive" }, NOT: { id: user.id } },
        select: { id: true },
      });
      if (taken) return "USERNAME_TAKEN" as const;
      // Délai vérifié dans l'écriture : deux changements simultanés, un seul passe
      const since = new Date(now.getTime() - cooldownDays * DAY_MS);
      const updated = await tx.user.updateMany({
        where: {
          id: user.id,
          deletionRequestedAt: null,
          OR: [{ usernameChangedAt: null }, { usernameChangedAt: { lte: since } }],
        },
        data: { username, usernameChangedAt: now },
      });
      return updated.count === 1 ? ("OK" as const) : ("TOO_SOON" as const);
    });
    if (outcome !== "OK") return { ok: false, error: outcome };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, error: "USERNAME_TAKEN" };
    throw e;
  }
  refresh();
  return { ok: true };
}

const localeSchema = z.object({ locale: z.enum(["fr", "en"]) });

/** Mémorise la langue choisie sur le compte (e-mails, notifications push). */
export async function setLocaleAction(input: unknown): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  const parsed = localeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`locale:${user.id}`, { limit: 20, windowSeconds: HOUR })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  if (parsed.data.locale !== user.locale) {
    await prisma.user.update({ where: { id: user.id }, data: { locale: parsed.data.locale } });
  }
  return { ok: true };
}
