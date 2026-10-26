import "server-only";
import { contentsLabel } from "@/lib/boosters/catalog";
import { SEALED_KINDS, type SealedKind } from "@/lib/boosters/draw";
import { effectiveSlotFloors, localize } from "@/lib/boosters/types";
import type { SealedDisplay } from "@/lib/boosters/view";
import { getBoosterTypes } from "./pools";
import { getBoosterRules } from "./rules";

/** Dessin des sachets scellés (types de kind DROP en base), dans la langue du lecteur. */
export async function getSealedDisplays(locale: string): Promise<Partial<Record<SealedKind, SealedDisplay>>> {
  const [entries, rules] = await Promise.all([getBoosterTypes(), getBoosterRules()]);
  return Object.fromEntries(
    SEALED_KINDS.flatMap((kind) => {
      const type = entries.find((e) => e.type.slug === kind && e.type.kind === "DROP")?.type;
      if (!type) return [];
      const cards = effectiveSlotFloors(type.slotFloors, rules.draw.slotFloors).length;
      const display: SealedDisplay = {
        kind,
        slug: type.slug,
        shape: type.shape,
        theme: type.theme,
        emblem: type.emblem,
        name: localize(type.name, locale),
        tagline: localize(type.tagline, locale),
        cards,
        contents: contentsLabel(cards),
      };
      return [[kind, display]];
    }),
  );
}
