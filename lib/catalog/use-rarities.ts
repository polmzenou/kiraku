import { useTranslations } from "next-intl";
import { BASE_DEFINITIONS, type RarityDefinition } from "./definitions";

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
export function useRaritySeals() {
  return Object.fromEntries(useRarityDefinitions().map((r) => [r.key, r.seal]));
}
