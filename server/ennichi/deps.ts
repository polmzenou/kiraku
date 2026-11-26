import "server-only";
import { ENNICHI_SETTING_KEYS, ennichiPhase, ennichiRulesFrom, ennichiSchedule, type EnnichiPhase, type EnnichiRules, type EnnichiSchedule } from "@/lib/ennichi/rules";
import type { SettingValue } from "@/lib/settings/defaults";
import { lotDeps } from "../economy/deps";
import { prisma } from "../db";
import { pushNotifications } from "../push/send";
import { getSetting } from "../settings";
import { commitSeedWith } from "./close-core";

// Dépendances serveur de l'Ennichi : règles lues dans GameSetting, état de l'édition (phase, graine engagée, tirage),
// versement des lots et Web Push. Les cœurs (server/ennichi/*-core.ts) les reçoivent injectées.

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
    await commitSeedWith(prisma, rules.edition, now);
    draw = await prisma.ennichiDraw.findUniqueOrThrow({ where: { edition: rules.edition }, select: { seedHash: true, committedAt: true, checkedAt: true, drawnAt: true } });
  }
  return { rules, schedule, phase: ennichiPhase(rules, now, draw.drawnAt), draw };
}

/** Pour un rattachement maintenant : édition en cours (sinon null) et réglage « plafond mensuel levé pendant la fête ». */
export async function ennichiAttachNow(now = new Date()): Promise<{ edition: number | null; liftCap: boolean }> {
  const state = await ennichiState(now);
  return state.phase === "live" ? { edition: state.rules.edition, liftCap: state.rules.liftCap } : { edition: null, liftCap: false };
}

export const ennichiPayDeps = (now = new Date()) => ({ lotDeps: lotDeps(), now, onNotified: (ids: string[]) => void pushNotifications(ids) });
