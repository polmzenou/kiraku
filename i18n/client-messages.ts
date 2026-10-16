import type { AbstractIntlMessages } from "next-intl";

// Namespaces lus par les composants client et leurs imports (dont Fuda et PageShell).
// Les textes réservés au serveur et l'admin ne traversent pas le fournisseur public.
export const CLIENT_NAMESPACES = [
  "account", "arcadePromo", "auth", "battle", "boosters", "cardBack", "collection",
  "common", "consent", "data", "discordJoin", "economy", "error", "footer", "friends",
  "fuda", "gifts", "header", "home", "legal", "locale", "mail", "market", "nav",
  "notifications", "opening", "privacy", "profile", "push", "pwa", "ranked", "rarity",
  "showcase", "theme", "time", "wiki", "wishlist",
] as const;

export function pickClientMessages(messages: AbstractIntlMessages): AbstractIntlMessages {
  return Object.fromEntries(CLIENT_NAMESPACES.map((key) => [key, messages[key]]));
}
