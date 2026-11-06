import type { EngineRules, Keyword } from "./types";

// Paramètres des textes de capacités (battle.keywords.*.desc, battle.techniques.*.desc), partagés par le
// lexique et le détail d'une carte. Chaque clé est toujours fournie : un texte peut en ignorer certaines.

type KeywordValues = EngineRules["keywords"];

/** Le chiffre principal d'un passif. Lu au cas par cas : une partie ancienne n'a pas les valeurs récentes. */
function keywordPct(kw: Keyword, k: KeywordValues): number {
  switch (kw) {
    case "POISON":
      return k.poisonPct;
    case "RIPOSTE":
      return k.ripostePct;
    case "LAST_WILL":
      return k.lastWillHealPct;
    case "REVIVE":
      return k.revivePct;
    case "LIFESTEAL":
      return k.lifestealPct;
    case "RAGE":
      return k.ragePct;
    case "ARMOR":
      return k.armorPct;
    case "EXECUTE":
      return k.executePct;
    case "TAUNT":
    case "BARRIER":
    case "FLURRY":
    case "CHANNEL":
      return 0;
  }
}

export function keywordParams(kw: Keyword, k: KeywordValues) {
  return {
    pct: keywordPct(kw, k),
    turns: k.poisonTurns,
    threshold: kw === "RAGE" ? k.rageThresholdPct : kw === "EXECUTE" ? k.executeThresholdPct : 0,
    orbs: kw === "CHANNEL" ? k.channelOrbs : 0,
  };
}

/** `value` : multiplicateur, soin, bonus ou orbes selon la technique. `format` écrit le multiplicateur dans la langue du joueur. */
export function techniqueParams(value: number, k: KeywordValues, format: (n: number) => string) {
  return { mult: format(value / 100), pct: value, orbs: value, turns: k.poisonTurns };
}

/** `value` : multiplicateur (Châtiment céleste, Tempête de pétales) ou PV rendus en % (Résurrection), selon l'ulti. */
export function ultimateParams(value: number, format: (n: number) => string) {
  return { mult: format(value / 100), pct: value };
}

/** Règle de charge : points par action, et pour la moitié de ses PV perdue (damagePct vaut pour tous les PV). */
export function chargeParams(charge: { perAction: number; damagePct: number }) {
  return { perAction: charge.perAction, half: Math.floor(charge.damagePct / 2) };
}
