import type { routing } from "@/i18n/routing";
import type messages from "./messages/fr.json";

// Clés de traduction typées : une clé absente de fr.json casse le typecheck.
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: Omit<typeof messages, "rarity"> & { rarity: Record<string, string> };
  }
}
