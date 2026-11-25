import type { SettingValue } from "@/lib/settings/defaults";

// Lots du parrainage (v1 et v2) et de l'Ennichi : ceux que leurs réglages versent. Toute l'équipe (ADMIN et DEV) en
// modifie le contenu depuis /admin/parrainage/lots ; un lot qui sert aussi ailleurs (missions, boutique, expéditions,
// fin de saison du classé, jauge d'événement) reste à l'admin, dans /admin/lots.

export type ReferralLotUsage =
  | { kind: "V1_REFERRER" }
  | { kind: "V1_REFEREE" }
  | { kind: "V1_MILESTONE"; referrals: number }
  | { kind: "STEP"; step: number; side: "REFEREE" | "REFERRER" | "TRUST" }
  | { kind: "GRAND" }
  | { kind: "MILESTONE"; installed: number }
  | { kind: "TIER"; tier: number }
  | { kind: "RANK"; from: number; to: number }
  | { kind: "OMIKUJI"; line: number };

/** Réglages qui versent un lot du parrainage ou de l'Ennichi. */
export const REFERRAL_LOT_SETTING_KEYS = [
  "referral.referrerLotId",
  "referral.refereeLotId",
  "referral.milestones",
  "referral.v2.stepLots",
  "referral.v2.grandLotId",
  "referral.v2.milestones",
  "ennichi.tiers",
  "ennichi.ranks",
  "ennichi.omikuji",
] as const;

export type ReferralLotSettings = { [K in (typeof REFERRAL_LOT_SETTING_KEYS)[number]]: SettingValue<K> };

/** Réglages d'autres parties du jeu qui versent un lot : un lot qu'ils citent n'est pas modifiable par le DEV. */
export const OTHER_LOT_SETTING_KEYS = ["ranked.rewardLots", "home.eventGauge.rewardLotId"] as const;

export type OtherLotSettings = { [K in (typeof OTHER_LOT_SETTING_KEYS)[number]]: SettingValue<K> };

/** Où chaque lot est versé par le parrainage et l'Ennichi, dans l'ordre des réglages. */
export function referralLotUsages(s: ReferralLotSettings): Map<string, ReferralLotUsage[]> {
  const out = new Map<string, ReferralLotUsage[]>();
  const add = (lotId: string | null, usage: ReferralLotUsage) => {
    if (lotId) out.set(lotId, [...(out.get(lotId) ?? []), usage]);
  };
  add(s["referral.referrerLotId"], { kind: "V1_REFERRER" });
  add(s["referral.refereeLotId"], { kind: "V1_REFEREE" });
  for (const m of s["referral.milestones"]) add(m.lotId, { kind: "V1_MILESTONE", referrals: m.referrals });
  s["referral.v2.stepLots"].forEach((lots, i) => {
    add(lots.referee, { kind: "STEP", step: i + 1, side: "REFEREE" });
    add(lots.referrer, { kind: "STEP", step: i + 1, side: "REFERRER" });
    add(lots.referrerTrust, { kind: "STEP", step: i + 1, side: "TRUST" });
  });
  add(s["referral.v2.grandLotId"], { kind: "GRAND" });
  for (const m of s["referral.v2.milestones"]) add(m.lotId, { kind: "MILESTONE", installed: m.installed });
  s["ennichi.tiers"].forEach((tier, i) => add(tier.lotId, { kind: "TIER", tier: i + 1 }));
  for (const r of s["ennichi.ranks"]) add(r.lotId, { kind: "RANK", from: r.from, to: r.to });
  s["ennichi.omikuji"].forEach((p, i) => add(p.lotId, { kind: "OMIKUJI", line: i + 1 }));
  return out;
}

/** Lots versés par les autres réglages du jeu (fin de saison du classé, jauge d'événement de l'accueil). */
export function otherSettingLotIds(s: OtherLotSettings): Set<string> {
  return new Set([...Object.values(s["ranked.rewardLots"]), s["home.eventGauge.rewardLotId"]].filter((id): id is string => id !== null));
}

export type ReferralLotAccess = "EDITABLE" | "NOT_REFERRAL_LOT" | "LOT_SHARED";

/**
 * Le DEV peut-il modifier ce lot ? Oui s'il est versé par le parrainage ou l'Ennichi (ou créé depuis leur page de
 * lots), et par rien d'autre : ni mission, ni article de boutique, ni expédition, ni autre réglage.
 */
export function referralLotAccess(input: { referral: boolean; createdHere: boolean; elsewhere: boolean }): ReferralLotAccess {
  if (!input.referral && !input.createdHere) return "NOT_REFERRAL_LOT";
  return input.elsewhere ? "LOT_SHARED" : "EDITABLE";
}
