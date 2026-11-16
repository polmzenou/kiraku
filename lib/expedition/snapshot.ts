import { z } from "@/lib/zod";
import { localizedSchema } from "@/lib/boosters/types";
import { rarityKeySchema } from "@/lib/catalog/definitions";
import { loreSchema } from "./admin-form";
import { EXPEDITION_OUTCOMES, EXPEDITION_RISKS } from "./types";

// Photo d'une expédition prise au lancement (Expedition.snapshot) : ce que le joueur a vu et ce qui
// sera versé, quoi que l'admin change ensuite au modèle.

const reward = z.object({ zeni: z.number().int().min(0), boosters: z.number().int().min(0), extraLot: z.boolean() });

export const snapshotSchema = z.object({
  v: z.literal(1),
  slug: z.string(),
  name: localizedSchema,
  lore: loreSchema,
  minRarity: rarityKeySchema,
  risk: z.enum(EXPEDITION_RISKS),
  durationMinutes: z.number().int().min(1),
  boosterTypeId: z.string(),
  extraLotId: z.string().nullable(),
  rewards: z.object(Object.fromEntries(EXPEDITION_OUTCOMES.map((o) => [o, reward])) as Record<(typeof EXPEDITION_OUTCOMES)[number], typeof reward>),
  /** Points de chance de chaque carte, dans l'ordre de l'équipe. */
  bonuses: z.array(z.number().int()),
});

export type ExpeditionSnapshot = z.infer<typeof snapshotSchema>;

/** Ambiance d'un modèle telle que stockée (Json, `{}` par défaut) → { fr, en } toujours lisible. */
export function loreOf(raw: unknown): { fr: string; en: string } {
  if (!raw || typeof raw !== "object") return { fr: "", en: "" };
  const r = raw as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 200) : "");
  return { fr: text(r.fr), en: text(r.en) };
}

export function parseSnapshot(raw: unknown): ExpeditionSnapshot | null {
  const parsed = snapshotSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
