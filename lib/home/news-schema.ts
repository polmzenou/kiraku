import { X_HANDLE, X_URL } from "@/lib/links";
import { z } from "@/lib/zod";
import { NEWS_ICON_KEYS, NEWS_MAX_ITEMS, NEWS_TONES } from "./news";

// Schéma de l'encart « Nouveautés » (clé home.news). Le français est obligatoire, l'anglais facultatif
// (le français s'affiche à sa place). Tout est rendu en texte : aucun HTML, aucun lien hors https.

const text = (max: number) => z.object({ fr: z.string().trim().min(1).max(max), en: z.string().trim().max(max) }).strict();
const optionalText = (max: number) => z.object({ fr: z.string().trim().max(max), en: z.string().trim().max(max) }).strict();

/** Page du site : un chemin absolu, jamais « // » ni « /\ » (qui partiraient vers un autre domaine). */
export const INTERNAL_PATH = /^\/(?![/\\])[^\s"'<>\\]*$/;

const linkSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }).strict(),
  z.object({ kind: z.literal("internal"), href: z.string().trim().max(200).regex(INTERNAL_PATH), label: text(40) }).strict(),
  z.object({ kind: z.literal("external"), href: z.url({ protocol: /^https$/ }).max(300), label: text(40) }).strict(),
]);

/** Une nouveauté : exportée pour que l'admin signale le champ fautif. */
export const newsItemSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,24}$/),
    tone: z.enum(NEWS_TONES),
    icon: z.enum(NEWS_ICON_KEYS).nullable(),
    title: text(80),
    body: text(400),
    link: linkSchema,
  })
  .strict();

export const newsSchema = z
  .object({
    enabled: z.boolean(),
    // Fixées par le serveur à chaque publication (lib/home/news.ts, nextPublication)
    revision: z.number().int().min(0).max(1_000_000),
    publishedAt: z.iso.datetime().nullable(),
    title: text(80),
    intro: optionalText(240),
    items: z.array(newsItemSchema).max(NEWS_MAX_ITEMS),
  })
  .strict()
  // Allumé sans nouveauté : l'accueil n'aurait rien à montrer
  .refine((n) => !n.enabled || n.items.length > 0, { message: "Au moins une nouveauté pour afficher l'encart" })
  .refine((n) => new Set(n.items.map((i) => i.id)).size === n.items.length, { message: "Identifiants de nouveautés en double" });

export type NewsConfig = z.infer<typeof newsSchema>;
export type NewsItem = NewsConfig["items"][number];
export type NewsLink = NewsItem["link"];

/** Récapitulatif de la v2.5, allumé : l'emplacement de l'ancien bandeau n'est jamais vide au déploiement. */
export const NEWS_DEFAULT: NewsConfig = {
  enabled: true,
  revision: 1,
  publishedAt: "2026-10-30T12:00:00.000Z",
  title: { fr: "Kiraku-kun v2.5", en: "Kiraku-kun v2.5" },
  intro: {
    fr: "On a passé les 1 000 joueurs, merci ! Voici ce qui change avec cette mise à jour.",
    en: "We've passed 1,000 players, thank you! Here's what this update brings.",
  },
  items: [
    {
      id: "parrainage",
      tone: "kin",
      icon: "REFERRAL",
      title: { fr: "Le parrainage évolue", en: "Referrals level up" },
      body: {
        fr: "Le parrainage passe à des paliers avec de grosses récompenses : plus tu invites d'amis, plus c'est gros.",
        en: "Referrals now come with tiers and big rewards: the more friends you invite, the bigger they get.",
      },
      link: { kind: "internal", href: "/parrainage", label: { fr: "Parrainer mes amis", en: "Invite my friends" } },
    },
    {
      id: "combat",
      tone: "shu",
      icon: "BATTLE",
      title: { fr: "Nouvelle interface de combat", en: "New battle interface" },
      body: {
        fr: "Les combats font peau neuve : arènes animées, techniques et coups critiques mis en scène. Des tournois pourraient bientôt s'organiser !",
        en: "Battles got a makeover: animated arenas, staged techniques and critical hits. Tournaments could be on the way!",
      },
      link: { kind: "internal", href: "/combat", label: { fr: "Combattre", en: "Battle" } },
    },
    {
      id: "boutique",
      tone: "ai",
      icon: "SHOP",
      title: { fr: "Une nouvelle boutique", en: "A new shop" },
      body: {
        fr: "La boutique se refait une beauté, avec le booster Impérial et plein d'autres choses.",
        en: "The shop has a fresh look, with the Imperial booster and plenty more.",
      },
      link: { kind: "internal", href: "/boutique", label: { fr: "Voir la boutique", en: "Visit the shop" } },
    },
    {
      id: "encens",
      tone: "hisui",
      icon: "NEW",
      title: { fr: "L'Encens", en: "Incense" },
      body: {
        fr: "Tirer des cartes rapporte des Encens : chacun augmente le taux des raretés pendant quelques heures.",
        en: "Drawing cards earns Incense: each one raises rarity odds for a few hours.",
      },
      link: { kind: "none" },
    },
    {
      id: "x",
      tone: "neutral",
      icon: "NEWS",
      title: { fr: "Reste à jour sur X", en: "Stay up to date on X" },
      body: { fr: `Suis ${X_HANDLE} pour ne rien rater des nouveautés.`, en: `Follow ${X_HANDLE} so you never miss what's new.` },
      link: { kind: "external", href: X_URL, label: { fr: `Suivre ${X_HANDLE}`, en: `Follow ${X_HANDLE}` } },
    },
  ],
};
