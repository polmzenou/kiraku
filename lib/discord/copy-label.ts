import type { FudaCopy } from "@/components/fuda/Fuda";
import { isEngraved } from "@/lib/collection/copies";

// Exemplaire spécial annoncé sur Discord (les messages du salon sont en français, comme le reste de lib/discord).

/** « Gravée 初摺 n° 17 / 25 · héritage 3 » ; null pour un exemplaire ordinaire. */
export function copyLabel(copy: FudaCopy | null | undefined): string | null {
  if (!copy) return null;
  const parts: string[] = [];
  if (isEngraved(copy)) {
    const seal = copy.seal ? `${copy.seal} ` : "";
    parts.push(`Gravée ${seal}n° ${copy.serial}${copy.size != null ? ` / ${copy.size}` : ""}`);
  }
  if (copy.heritage > 0) parts.push(`héritière, héritage ${copy.heritage}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}
