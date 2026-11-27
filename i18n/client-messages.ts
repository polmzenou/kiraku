import type { AbstractIntlMessages } from "next-intl";

// Namespaces lus par les composants client et leurs imports (dont Fuda). Les textes réservés au serveur et l'admin
// ne traversent pas le fournisseur public : ni le pied de page (PageShell, ArcadeFooterLink et XFollowLink sont rendus
// au serveur, footer et arcadePromo restent donc ici absents), ni les pages elles-mêmes.
export const CLIENT_NAMESPACES = [
  "account", "achievements", "ambassador", "auth", "battle", "boosters", "cardBack", "casino", "chat", "collection",
  "common", "consent", "data", "discordJoin", "economy", "error", "event", "expedition", "friends", "prestige",
  "fuda", "gifts", "header", "home", "incense", "kyaraImport", "legal", "locale", "mail", "market", "nav",
  "news", "notifications", "opening", "playerName", "presence", "privacy", "profile", "push", "pwa", "ranked", "rarity", "referralV2", "invite", "ennichi", "sealed",
  "listings", "showcase", "spoiler", "theme", "time", "trades", "v1Welcome", "v2Announcement", "wiki", "wishlist", "wrapped",
] as const;

// Namespaces dont seuls quelques sous-espaces servent aux composants client : le reste, lu par les pages serveur,
// ne traverse pas chaque page (prestige : parcours de renaissance, erreurs, rite d'encre, cinématique, consécration).
export const CLIENT_SUBSETS: Partial<Record<(typeof CLIENT_NAMESPACES)[number], readonly string[]>> = {
  prestige: ["flow", "errors", "rite", "cinematic", "consecrate"],
  // Succès : la grille (filtre, mise en avant) ; noms et descriptions sont traduits au serveur (secrets masqués)
  achievements: ["grid"],
  // Import Kyara : formulaire, annulation, erreurs et bannière de l'accueil ; la page elle-même est rendue au serveur
  kyaraImport: ["form", "cancel", "errors", "banner"],
  // Parrainage v2 : cartes des étapes et tableau des filleuls (avec leurs cadeaux et leur jauge), grille du choix des
  // bons ; le reste est rendu au serveur
  referralV2: ["steps", "gifts", "table", "meter", "picker", "story"],
  // Invitation : la fenêtre qui suit le premier booster d'un invité arrivé par un lien ; la page /i/CODE est rendue au serveur
  invite: ["prompt"],
  // Ennichi : compte à rebours, explications « ? », rediffusion de l'omikuji et sa vérification ; le reste est rendu au serveur
  ennichi: ["countdown", "help", "omikuji", "verify"],
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
