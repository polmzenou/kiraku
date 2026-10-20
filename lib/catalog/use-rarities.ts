import { useTranslations } from "next-intl";
import { BASE_DEFINITIONS, type RarityDefinition } from "./definitions";

/** next-intl exposes the same request-scoped registry in server and client components. */
export function useRarityDefinitions(): RarityDefinition[] {
  const t = useTranslations("rarity");
  return t.has("registry") ? JSON.parse(t.raw("registry")) as RarityDefinition[] : BASE_DEFINITIONS;
}
export function useRarities() {
  return useRarityDefinitions().map((r) => r.key);
}
export function useRaritySeals() {
  return Object.fromEntries(useRarityDefinitions().map((r) => [r.key, r.seal]));
}
