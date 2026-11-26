import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";
import { getPublishedRarities } from "@/server/catalog/queries";
import { getRarityDefinitions } from "@/server/catalog/rarities";
import { BASE_DEFINITIONS } from "@/lib/catalog/definitions";
import { getSetting } from "@/server/settings";

const DEFAULT_TIME_ZONE = "Europe/Paris";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const messages = (await import(`../messages/${locale}.json`)).default;
  // Global static error pages have no locale-bound request and render no catalogue cards.
  // Do not make their prerendering depend on a live database or an already deployed migration.
  const bound = hasLocale(routing.locales, requested);
  const [definitions, published, timeZone] = bound
    // Raretés publiées (filtres) : sans elles, les filtres proposent tout, la page s'affiche quand même
    ? await Promise.all([getRarityDefinitions(), getPublishedRarities().catch(() => null), getSetting("game.timeZone").catch(() => DEFAULT_TIME_ZONE)])
    : [BASE_DEFINITIONS, null, DEFAULT_TIME_ZONE];
  return {
    locale,
    // Dates et heures dans le fuseau du jeu, côté serveur comme côté client (sans lui, celui du processus : UTC sur le VPS)
    timeZone,
    messages: { ...messages, rarity: { ...messages.rarity,
      ...Object.fromEntries(definitions.map((r) => [r.key, locale === "en" ? r.nameEn || r.nameFr : r.nameFr])),
      registry: JSON.stringify(definitions),
      ...(published && { published: JSON.stringify(published) }),
    } },
  };
});
