import { slugSchema } from "@/lib/boosters/types";
import { X_HANDLE, X_URL } from "@/lib/links";
import { z } from "@/lib/zod";
import { NEWS_ICON_KEYS, NEWS_MAX_CARDS, NEWS_MAX_ITEMS, NEWS_TAGS, NEWS_TONES } from "./news";

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

/**
 * Visuel de la bannière : des cartes du catalogue (éventail), un booster (son sachet, et ses vedettes
 * pour une bannière), ou une image téléversée (/api/admin/nouveautes/upload ; l'hôte est vérifié par
 * le serveur à l'enregistrement, lib/home/news.ts validNewsImageUrl).
 */
export const newsVisualSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }).strict(),
  z
    .object({
      kind: z.literal("cards"),
      cardIds: z
        .array(z.string().regex(/^[a-z0-9]{8,40}$/))
        .min(1)
        .max(NEWS_MAX_CARDS)
        .refine((ids) => new Set(ids).size === ids.length, { message: "Carte choisie deux fois" }),
    })
    .strict(),
  z.object({ kind: z.literal("booster"), slug: slugSchema }).strict(),
  z
    .object({
      kind: z.literal("image"),
      url: z.url({ protocol: /^https$/ }).max(500),
      // Point gardé au recadrage (object-position), en % de la largeur et de la hauteur
      focalX: z.number().int().min(0).max(100),
      focalY: z.number().int().min(0).max(100),
    })
    .strict(),
]);

/** Une nouveauté : exportée pour que l'admin signale le champ fautif. */
export const newsItemSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,24}$/),
    tone: z.enum(NEWS_TONES),
    icon: z.enum(NEWS_ICON_KEYS).nullable(),
    tag: z.enum(NEWS_TAGS).nullable(),
    title: text(80),
    body: text(400),
    link: linkSchema,
    visual: newsVisualSchema,
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
export type NewsVisual = NewsItem["visual"];

/**
 * Récapitulatif de la v2.5, allumé : l'emplacement de l'ancien bandeau n'est jamais vide au déploiement.
 * La boutique montre le booster Impérial (sans lui, la bannière garde son sceau).
 */
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
      tag: "UPDATE",
      title: { fr: "Le parrainage évolue", en: "Referrals level up" },
      body: {
        fr: "Le parrainage passe à des paliers avec de grosses récompenses : plus tu invites d'amis, plus c'est gros.",
        en: "Referrals now come with tiers and big rewards: the more friends you invite, the bigger they get.",
      },
      link: { kind: "internal", href: "/parrainage", label: { fr: "Parrainer mes amis", en: "Invite my friends" } },
      visual: { kind: "none" },
    },
    {
      id: "combat",
      tone: "shu",
      icon: "BATTLE",
      tag: "UPDATE",
      title: { fr: "Nouvelle interface de combat", en: "New battle interface" },
      body: {
        fr: "Les combats font peau neuve : arènes animées, techniques et coups critiques mis en scène. Des tournois pourraient bientôt s'organiser !",
        en: "Battles got a makeover: animated arenas, staged techniques and critical hits. Tournaments could be on the way!",
      },
      link: { kind: "internal", href: "/combat", label: { fr: "Combattre", en: "Battle" } },
      visual: { kind: "none" },
    },
    {
      id: "boutique",
      tone: "ai",
      icon: "SHOP",
      tag: "NEW_BOOSTER",
      title: { fr: "Une nouvelle boutique", en: "A new shop" },
      body: {
        fr: "La boutique se refait une beauté, avec le booster Impérial et plein d'autres choses.",
        en: "The shop has a fresh look, with the Imperial booster and plenty more.",
      },
      link: { kind: "internal", href: "/boutique", label: { fr: "Voir la boutique", en: "Visit the shop" } },
      visual: { kind: "booster", slug: "imperial" },
    },
    {
      id: "encens",
      tone: "hisui",
      icon: "NEW",
      tag: "NEW",
      title: { fr: "L'Encens", en: "Incense" },
      body: {
        fr: "Tirer des cartes rapporte des Encens : chacun augmente le taux des raretés pendant quelques heures.",
        en: "Drawing cards earns Incense: each one raises rarity odds for a few hours.",
      },
      link: { kind: "none" },
      visual: { kind: "none" },
    },
    {
      id: "x",
      tone: "neutral",
      icon: "NEWS",
      tag: null,
      title: { fr: "Reste à jour sur X", en: "Stay up to date on X" },
      body: { fr: `Suis ${X_HANDLE} pour ne rien rater des nouveautés.`, en: `Follow ${X_HANDLE} so you never miss what's new.` },
      link: { kind: "external", href: X_URL, label: { fr: `Suivre ${X_HANDLE}`, en: `Follow ${X_HANDLE}` } },
      visual: { kind: "none" },
    },
  ],
};
