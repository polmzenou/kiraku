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
  | "locale"
  | "sound"
  | "discordLater"
  | "speedInsights";

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
    name: "NEXT_LOCALE",
    kind: "cookie",
    category: "preferences",
    purpose: "locale",
    duration: { unit: "session" },
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
    name: "kiraku.discord-later",
    kind: "localStorage",
    category: "preferences",
    purpose: "discordLater",
    duration: { unit: "persistent" },
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
