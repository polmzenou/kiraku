import type { AbstractIntlMessages } from "next-intl";

// Namespaces lus par les composants client et leurs imports (dont Fuda et PageShell).
// Les textes réservés au serveur et l'admin ne traversent pas le fournisseur public.
export const CLIENT_NAMESPACES = [
  "account", "ambassador", "arcadePromo", "auth", "battle", "boosters", "cardBack", "casino", "chat", "collection",
  "common", "consent", "data", "discordJoin", "economy", "error", "event", "expedition", "footer", "friends", "prestige",
  "fuda", "gifts", "header", "home", "incense", "kyaraImport", "legal", "locale", "mail", "market", "nav",
  "news", "notifications", "opening", "playerName", "presence", "privacy", "profile", "push", "pwa", "ranked", "rarity", "sealed",
  "listings", "showcase", "spoiler", "theme", "time", "trades", "v1Welcome", "v2Announcement", "wiki", "wishlist", "wrapped",
] as const;

// Namespaces dont seuls quelques sous-espaces servent aux composants client : le reste, lu par les pages serveur,
// ne traverse pas chaque page (prestige : parcours de renaissance, erreurs, rite d'encre, cinématique, consécration).
export const CLIENT_SUBSETS: Partial<Record<(typeof CLIENT_NAMESPACES)[number], readonly string[]>> = {
  prestige: ["flow", "errors", "rite", "cinematic", "consecrate"],
  // Import Kyara : formulaire, annulation, erreurs et bannière de l'accueil ; la page elle-même est rendue au serveur
  kyaraImport: ["form", "cancel", "errors", "banner"],
};

export function pickClientMessages(messages: AbstractIntlMessages): AbstractIntlMessages {
  return Object.fromEntries(
    CLIENT_NAMESPACES.map((key) => {
      const value = messages[key];
      const keep = CLIENT_SUBSETS[key];
      if (!keep || !value || typeof value !== "object") return [key, value];
      return [key, Object.fromEntries(keep.map((sub) => [sub, value[sub]]))];
    }),
  );
}
