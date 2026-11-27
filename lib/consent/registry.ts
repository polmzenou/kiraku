// Registre unique des cookies et stockages locaux de Kiraku : la page Cookies, le panneau de
// consentement et le bandeau le lisent. Tout nouveau cookie ou traceur s'ajoute ici d'abord.
//
// `exempt` : exempté de consentement (strictement nécessaire au service demandé, ou préférence
// choisie par le joueur). Dès qu'une entrée non exemptée existe, le bandeau s'affiche.

export const CONSENT_CATEGORIES = ["necessary", "preferences", "measure"] as const;
export type ConsentCategory = (typeof CONSENT_CATEGORIES)[number];

/** Rôles décrits sur la page Cookies (clés i18n `consent.purposes.*`). */
export type StoragePurpose =
  | "session"
  | "referral"
  | "discordSignIn"
  | "consent"
  | "theme"
  | "motion"
  | "nav"
  | "locale"
  | "sound"
  | "discordLater"
  | "news"
  | "casinoCeremony"
  | "kyaraBanner"
  | "wrappedBanner"
  | "speedInsights"
  | "security"
  | "guestNotice"
  | "battleSpeed"
  | "fxTier"
  | "tilt";

export type StorageDuration = { unit: "session" | "none" } | { unit: "minutes" | "days"; value: number } | { unit: "persistent" };

export type StorageEntry = {
  /** Nom exact (en production, les cookies httpOnly portent le préfixe __Secure-). */
  name: string;
  kind: "cookie" | "localStorage" | "none";
  category: ConsentCategory;
  purpose: StoragePurpose;
  duration: StorageDuration;
  provider: "kiraku" | "authjs" | "vercel";
  exempt: boolean;
};

export const STORAGE_REGISTRY: readonly StorageEntry[] = [
  {
    name: "Vercel Speed Insights",
    kind: "none",
    category: "measure",
    purpose: "speedInsights",
    duration: { unit: "none" },
    provider: "vercel",
    exempt: true,
  },
  {
    name: "__Secure-kiraku.session",
    kind: "cookie",
    category: "necessary",
    purpose: "session",
    duration: { unit: "days", value: 90 },
    provider: "kiraku",
    exempt: true,
  },
  {
    name: "__Secure-kiraku.ref",
    kind: "cookie",
    category: "necessary",
    purpose: "referral",
    duration: { unit: "days", value: 30 },
    provider: "kiraku",
    exempt: true,
  },
  {
    // Identifiant aléatoire de l'appareil (server/anticheat/signals.ts) : repère les comptes en série et fait
    // respecter un ban réseau (server/anticheat/network-ban.ts)
    name: "__Secure-kiraku.device",
    kind: "cookie",
    category: "necessary",
    purpose: "security",
    duration: { unit: "days", value: 730 },
    provider: "kiraku",
    exempt: true,
  },
  {
    name: "__Secure-authjs.csrf-token, __Secure-authjs.callback-url, __Secure-authjs.pkce.code_verifier, __Secure-authjs.state",
    kind: "cookie",
    category: "necessary",
    purpose: "discordSignIn",
    duration: { unit: "minutes", value: 15 },
    provider: "authjs",
    exempt: true,
  },
  {
    name: "kiraku.consent",
    kind: "cookie",
    category: "necessary",
    purpose: "consent",
    duration: { unit: "days", value: 182 },
    provider: "kiraku",
    exempt: true,
  },
  {
    name: "kiraku-theme",
    kind: "cookie",
    category: "preferences",
    purpose: "theme",
    duration: { unit: "days", value: 365 },
    provider: "kiraku",
    exempt: true,
  },
  {
    name: "kiraku-motion",
    kind: "cookie",
    category: "preferences",
    purpose: "motion",
    duration: { unit: "days", value: 365 },
    provider: "kiraku",
    exempt: true,
  },
  {
    // Navigation desktop : menus groupés ou barre latérale (lib/nav-layout.ts)
    name: "kiraku-nav",
    kind: "cookie",
    category: "preferences",
    purpose: "nav",
    duration: { unit: "days", value: 365 },
    provider: "kiraku",
    exempt: true,
  },
  {
    name: "NEXT_LOCALE",
    kind: "cookie",
    category: "preferences",
    purpose: "locale",
    duration: { unit: "session" },
    provider: "kiraku",
    exempt: true,
  },
  {
    // Date de la dernière prolongation du cookie de session (components/auth/SessionRefresh.tsx, une fois par jour)
    name: "kiraku.session-refreshed",
    kind: "localStorage",
    category: "necessary",
    purpose: "session",
    duration: { unit: "persistent" },
    provider: "kiraku",
    exempt: true,
  },
  {
    name: "kiraku.sound",
    kind: "localStorage",
    category: "preferences",
    purpose: "sound",
    duration: { unit: "persistent" },
    provider: "kiraku",
    exempt: true,
  },
  {
    // Musique du combat (components/battle/stage/useBattleSound.ts)
    name: "kiraku.music",
    kind: "localStorage",
    category: "preferences",
    purpose: "sound",
    duration: { unit: "persistent" },
    provider: "kiraku",
    exempt: true,
  },
  {
    // Vitesse du replay de combat (components/battle/stage/useBattleSpeed.ts)
    name: "kiraku.battle.speed",
    kind: "localStorage",
    category: "preferences",
    purpose: "battleSpeed",
    duration: { unit: "persistent" },
    provider: "kiraku",
    exempt: true,
  },
  {
    // Niveau d'effets mesuré sur cet appareil (components/motion/fx-tier.ts)
    name: "kiraku-fx-tier",
    kind: "localStorage",
    category: "preferences",
    purpose: "fxTier",
    duration: { unit: "persistent" },
    provider: "kiraku",
    exempt: true,
  },
  {
    // Réponse à la demande d'accès à l'inclinaison du téléphone (lib/tilt-dom.ts, iPhone)
    name: "kiraku:tilt",
    kind: "localStorage",
    category: "preferences",
    purpose: "tilt",
    duration: { unit: "persistent" },
    provider: "kiraku",
    exempt: true,
  },
  {
    // Bandeau des invités repoussé 24 h (« Plus tard », components/account/GuestRetentionNotice.tsx) : le cookie, lu au
    // rendu serveur pour ne plus le rendre, et le stockage local en secours (reports d'avant le cookie)
    name: "kiraku-guest-notice",
    kind: "cookie",
    category: "preferences",
    purpose: "guestNotice",
    duration: { unit: "days", value: 1 },
    provider: "kiraku",
    exempt: true,
  },
  {
    name: "kiraku.guestNotice.hiddenUntil",
    kind: "localStorage",
    category: "preferences",
    purpose: "guestNotice",
    duration: { unit: "persistent" },
    provider: "kiraku",
    exempt: true,
  },
  {
    name: "kiraku.discord-later",
    kind: "localStorage",
    category: "preferences",
    purpose: "discordLater",
    duration: { unit: "persistent" },
    provider: "kiraku",
    exempt: true,
  },
  {
    // Cérémonie d'ouverture du casino déjà vue sur cet appareil (components/casino/CeremonyGate.tsx)
    name: "kiraku.casino-ceremony",
    kind: "localStorage",
    category: "preferences",
    purpose: "casinoCeremony",
    duration: { unit: "persistent" },
    provider: "kiraku",
    exempt: true,
  },
  {
    // Bannière de l'import Kyara masquée sur cet appareil (components/kyara/KyaraImportBanner.tsx) : le cookie, lu au
    // rendu serveur pour ne plus la rendre, et le stockage local en secours
    name: "kiraku-kyara-banner",
    kind: "cookie",
    category: "preferences",
    purpose: "kyaraBanner",
    duration: { unit: "days", value: 365 },
    provider: "kiraku",
    exempt: true,
  },
  {
    name: "kiraku.kyara-banner",
    kind: "localStorage",
    category: "preferences",
    purpose: "kyaraBanner",
    duration: { unit: "persistent" },
    provider: "kiraku",
    exempt: true,
  },
  {
    // Bannière du Wrapped masquée sur cet appareil pour une année (components/home/WrappedBanner.tsx) : le cookie, qui
    // porte l'année et que le rendu serveur lit pour ne plus la rendre, et le stockage local en secours
    name: "kiraku-wrapped-banner",
    kind: "cookie",
    category: "preferences",
    purpose: "wrappedBanner",
    duration: { unit: "days", value: 365 },
    provider: "kiraku",
    exempt: true,
  },
  {
    name: "kiraku:wrapped-banner:YYYY",
    kind: "localStorage",
    category: "preferences",
    purpose: "wrappedBanner",
    duration: { unit: "persistent" },
    provider: "kiraku",
    exempt: true,
  },
  {
    // Révision de l'encart Nouveautés que le joueur a réduite (lib/home/news-dom.ts)
    name: "kiraku-news",
    kind: "cookie",
    category: "preferences",
    purpose: "news",
    duration: { unit: "days", value: 365 },
    provider: "kiraku",
    exempt: true,
  },
];

/** Catégories qui demandent un choix : celles qui contiennent au moins un traceur non exempté. */
export function optionalCategories(registry: readonly StorageEntry[] = STORAGE_REGISTRY): ConsentCategory[] {
  const out = new Set<ConsentCategory>();
  for (const entry of registry) if (!entry.exempt && entry.category !== "necessary") out.add(entry.category);
  return CONSENT_CATEGORIES.filter((c) => out.has(c));
}
