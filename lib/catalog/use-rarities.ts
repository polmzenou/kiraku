import { useTranslations } from "next-intl";
import { BASE_DEFINITIONS, type RarityDefinition } from "./definitions";
import { visibleRarities } from "./visible-rarities";

// Le registre arrive en JSON dans les messages : analysé une fois par valeur, pas à chaque carte rendue.
// Le tableau rendu est partagé : lecture seule.
let parsed: { raw: string; definitions: RarityDefinition[] } | null = null;
function parseRegistry(raw: string): RarityDefinition[] {
  if (parsed?.raw !== raw) parsed = { raw, definitions: JSON.parse(raw) as RarityDefinition[] };
  return parsed.definitions;
}

/** next-intl exposes the same request-scoped registry in server and client components. */
export function useRarityDefinitions(): RarityDefinition[] {
  const t = useTranslations("rarity");
  return t.has("registry") ? parseRegistry(t.raw("registry") as string) : BASE_DEFINITIONS;
}
export function useRarities() {
  return useRarityDefinitions().map((r) => r.key);
}
let parsedPublished: { raw: string; keys: string[] } | null = null;
function parsePublished(raw: string): string[] {
  if (parsedPublished?.raw !== raw) parsedPublished = { raw, keys: JSON.parse(raw) as string[] };
  return parsedPublished.keys;
}
/** Raretés ayant au moins une carte publiée (messages, comme le registre) ; null si inconnues. */
export function usePublishedRarities(): string[] | null {
  const t = useTranslations("rarity");
  return t.has("published") ? parsePublished(t.raw("published") as string) : null;
}
/** Raretés à proposer dans un filtre : les publiées, plus `keep` (filtre en cours, cartes possédées). */
export function useFilterRarities(keep: Iterable<string> = []): string[] {
  return visibleRarities(useRarities(), usePublishedRarities(), keep);
}
export function useRaritySeals() {
  return Object.fromEntries(useRarityDefinitions().map((r) => [r.key, r.seal]));
}
