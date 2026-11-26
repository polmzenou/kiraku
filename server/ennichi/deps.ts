import "server-only";
import { getTranslations } from "next-intl/server";
import { ENNICHI_SETTING_KEYS, ennichiPhase, ennichiRulesFrom, ennichiSchedule, type EnnichiPhase, type EnnichiRules, type EnnichiSchedule } from "@/lib/ennichi/rules";
import type { SettingValue } from "@/lib/settings/defaults";
import { lotDeps } from "../economy/deps";
import { prisma } from "../db";
import { env } from "../env";
import { pushNotifications } from "../push/send";
import { getSetting } from "../settings";
import { commitSeedWith, type DrawSecrets, type TitleText } from "./close-core";
import { ennichiSeedKey } from "./seed";

// Dépendances serveur de l'Ennichi : règles lues dans GameSetting, état de l'édition (phase, graine engagée, tirage),
// clé des graines scellées dérivée d'AUTH_SECRET, textes des titres, versement des lots et Web Push. Les cœurs
// (server/ennichi/*-core.ts) les reçoivent injectées.

let seedKey: Buffer | null = null;

/** Clé des graines scellées de l'Ennichi (jamais le secret lui-même). */
function editionSeedKey(): Buffer {
  seedKey ??= ennichiSeedKey(env.AUTH_SECRET);
  return seedKey;
}

/** Textes des titres sumo créés au tirage, en français et en anglais (messages ennichi.cosmetic). */
async function ennichiTitleText(): Promise<TitleText> {
  const [fr, en] = await Promise.all([getTranslations({ locale: "fr", namespace: "ennichi" }), getTranslations({ locale: "en", namespace: "ennichi" })]);
  return (title, band, edition) => ({
    label: {
      fr: fr("cosmetic.label", { title: fr(`banzuke.titles.${title}`), edition }),
      en: en("cosmetic.label", { title: en(`banzuke.titles.${title}`), edition }),
    },
    hint:
      band.from === band.to
        ? { fr: fr("cosmetic.hintOne", { rank: band.from, edition }), en: en("cosmetic.hintOne", { rank: band.from, edition }) }
        : { fr: fr("cosmetic.hintRange", { from: band.from, to: band.to, edition }), en: en("cosmetic.hintRange", { from: band.from, to: band.to, edition }) },
  });
}

/** Ce que le tirage reçoit du serveur : clé des graines scellées, textes des titres. */
export async function ennichiDrawSecrets(): Promise<DrawSecrets> {
  return { seedKey: editionSeedKey(), titleText: await ennichiTitleText() };
}

export async function ennichiRules(): Promise<EnnichiRules> {
  const values = await Promise.all(ENNICHI_SETTING_KEYS.map((key) => getSetting(key)));
  const byKey = Object.fromEntries(ENNICHI_SETTING_KEYS.map((key, i) => [key, values[i]])) as { [K in (typeof ENNICHI_SETTING_KEYS)[number]]: SettingValue<K> };
  return ennichiRulesFrom(byKey);
}

export type EnnichiState = {
  rules: EnnichiRules;
  schedule: EnnichiSchedule | null;
  phase: EnnichiPhase;
  draw: { seedHash: string; committedAt: Date; checkedAt: Date | null; drawnAt: Date | null } | null;
};

/**
 * État de l'édition en cours. Dès que la fête est allumée et datée, la graine du tirage est engagée (une fois) : son
 * empreinte est publiée avant le premier ami arrivé.
 */
export async function ennichiState(now = new Date()): Promise<EnnichiState> {
  const rules = await ennichiRules();
  const schedule = ennichiSchedule(rules);
  if (!rules.enabled || !schedule) return { rules, schedule, phase: "off", draw: null };
  let draw = await prisma.ennichiDraw.findUnique({
    where: { edition: rules.edition },
    select: { seedHash: true, committedAt: true, checkedAt: true, drawnAt: true },
  });
  if (!draw) {
    await commitSeedWith(prisma, rules.edition, now, editionSeedKey());
    draw = await prisma.ennichiDraw.findUniqueOrThrow({ where: { edition: rules.edition }, select: { seedHash: true, committedAt: true, checkedAt: true, drawnAt: true } });
  }
  return { rules, schedule, phase: ennichiPhase(rules, now, draw.drawnAt), draw };
}

/**
 * Pour un rattachement maintenant : édition en cours (sinon null), multiplicateur des étapes 1 et 2 à figer sur le
 * parrainage, et réglage « plafond mensuel levé pendant la fête ».
 */
export async function ennichiAttachNow(now = new Date()): Promise<{ edition: number | null; multiplier: number | null; liftCap: boolean }> {
  const state = await ennichiState(now);
  return state.phase === "live"
    ? { edition: state.rules.edition, multiplier: Math.max(1, state.rules.stepMultiplier), liftCap: state.rules.liftCap }
    : { edition: null, multiplier: null, liftCap: false };
}

export const ennichiPayDeps = (now = new Date()) => ({ lotDeps: lotDeps(), now, onNotified: (ids: string[]) => void pushNotifications(ids) });
