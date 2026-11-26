import { z } from "@/lib/zod";
import type { ExpeditionOutcome, ExpeditionRisk } from "./types";

// Photo d'une expédition prise au lancement (Expedition.snapshot) : ce que le joueur a vu et ce qui
// sera versé, quoi que l'admin change ensuite au modèle ou à son lot bonus.
//
// Ces photos restent en base des heures, voire des jours (rapport pas encore ouvert, journal) : leur schéma
// est figé ici, version par version, sans rien importer des formulaires de l'admin. Un formulaire peut se
// resserrer (nom plus court, ambiance plus courte, clé de rareté renommée), une photo déjà écrite doit rester
// lisible. D'où des bornes larges, aucun .strict() et des listes recopiées telles qu'en version 1.
// Les gains se lisent à part (parseSnapshotPayout) : un champ purement visuel illisible ne les annule jamais.

/** Listes de la version 1, figées (types.ts peut évoluer, pas les photos déjà écrites). */
const V1_RISKS = ["SAFE", "BALANCED", "RISKY"] as const satisfies readonly ExpeditionRisk[];

const text = (max: number) => z.string().max(max);
const quantity = z.number().int().min(1).max(1_000);

const reward = z.object({ zeni: z.number().int().min(0), boosters: z.number().int().min(0), extraLot: z.boolean() });
const rewards = z.object({ FAILURE: reward, SUCCESS: reward, TRIUMPH: reward } satisfies Record<ExpeditionOutcome, typeof reward>);

/**
 * Lot bonus recopié au lancement : c'est lui qui est versé au retour, même si l'admin modifie ou supprime le
 * lot entre-temps. Absent des photos écrites avant le 26/11/2026 (le lot se relit alors par son id).
 */
const lotSchema = z.object({
  zeni: z.number().int().min(0),
  items: z
    .array(
      z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("BOOSTER"), boosterTypeId: text(200), quantity }),
        z.object({ kind: z.literal("CARD"), cardId: text(200), quantity }),
        z.object({ kind: z.literal("RARITY_CARD"), rarity: text(200), quantity }),
      ]),
    )
    .max(100),
});

export type SnapshotLot = z.infer<typeof lotSchema>;

/** Version 1, complète : validée au lancement, avant écriture. */
export const snapshotSchema = z.object({
  v: z.literal(1),
  slug: text(200),
  name: z.object({ fr: text(1_000), en: text(1_000) }),
  lore: z.object({ fr: text(2_000), en: text(2_000) }),
  minRarity: text(200).min(1),
  risk: z.enum(V1_RISKS),
  durationMinutes: z.number().int().min(1),
  boosterTypeId: text(200),
  extraLotId: text(200).nullable(),
  lot: lotSchema.nullable().optional(),
  rewards,
  /** Points de chance de chaque carte, dans l'ordre de l'équipe. */
  bonuses: z.array(z.number().int()),
});

export type ExpeditionSnapshot = z.infer<typeof snapshotSchema>;

/** Ce que la clôture verse : gains par issue, booster et lot bonus. Rien d'autre n'est exigé. */
const payoutSchema = z.object({
  v: z.literal(1),
  boosterTypeId: z.string(),
  extraLotId: z.string().nullable(),
  // Copie du lot illisible : le lot se relit par son id, comme pour une photo d'avant la copie
  lot: lotSchema.nullable().optional().catch(undefined),
  rewards,
});

export type SnapshotPayout = z.infer<typeof payoutSchema>;

export function parseSnapshotPayout(raw: unknown): SnapshotPayout | null {
  const parsed = payoutSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

const NO_REWARD = { zeni: 0, boosters: 0, extraLot: false };

/**
 * Lecture pour l'affichage (expédition en route, rapport, journal) : jamais d'échec, chaque champ illisible a
 * son repli. Gains illisibles : zéro partout, ce qu'a versé la clôture dans ce cas.
 */
const displaySchema = z.object({
  v: z.literal(1).catch(1),
  slug: z.string().catch(""),
  name: z.object({ fr: z.string(), en: z.string() }).catch({ fr: "", en: "" }),
  lore: z.object({ fr: z.string(), en: z.string() }).catch({ fr: "", en: "" }),
  minRarity: z.string().min(1).catch("COMMON"),
  risk: z.enum(V1_RISKS).catch("BALANCED"),
  durationMinutes: z.number().int().min(1).catch(1),
  boosterTypeId: z.string().catch(""),
  extraLotId: z.string().nullable().catch(null),
  lot: lotSchema.nullable().optional().catch(undefined),
  rewards: rewards.catch({ FAILURE: NO_REWARD, SUCCESS: NO_REWARD, TRIUMPH: NO_REWARD }),
  bonuses: z.array(z.number().int()).catch([]),
});

export function readSnapshot(raw: unknown): ExpeditionSnapshot {
  const parsed = displaySchema.safeParse(raw);
  // Pas même un objet : tous les replis
  const snap: ExpeditionSnapshot = parsed.success ? parsed.data : displaySchema.parse({});
  // Nom illisible : le slug, plutôt qu'un rapport sans titre
  return snap.name.fr ? snap : { ...snap, name: { fr: snap.slug, en: "" } };
}

/** Lot bonus versé à la clôture (Expedition.lotGrant), pour le rapport et le journal. */
const lotGrantSchema = z.object({
  zeni: z.number().int().min(0).catch(0),
  boosters: z.array(z.object({ boosterTypeId: z.string(), count: z.number().int().min(0) })).catch([]),
});

export type LotGrantSummary = z.infer<typeof lotGrantSchema>;

/** null : aucun lot versé (pas de lot, échec, lot introuvable) ou expédition close avant ce relevé. */
export function parseLotGrant(raw: unknown): LotGrantSummary | null {
  const parsed = lotGrantSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Ambiance d'un modèle telle que stockée (Json, `{}` par défaut) → { fr, en } toujours lisible. */
export function loreOf(raw: unknown): { fr: string; en: string } {
  if (!raw || typeof raw !== "object") return { fr: "", en: "" };
  const r = raw as Record<string, unknown>;
  const clip = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 200) : "");
  return { fr: clip(r.fr), en: clip(r.en) };
}
