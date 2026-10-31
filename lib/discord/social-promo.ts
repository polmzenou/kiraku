import { z } from "@/lib/zod";
import { DISCORD_INVITE_PATTERN } from "./join-modal";

// Section « Rejoins notre Discord » de la page Social : coupée par défaut, pilotée depuis /admin/discord
// (interrupteur, lien, textes fr/en, fenêtre d'affichage facultative). Distincte du modal et de la
// connexion Discord du compte.

const text = (max: number) => z.object({ fr: z.string().trim().min(1).max(max), en: z.string().trim().max(max) }).strict();
const isoDate = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: "Date invalide" })
  .nullable();

export const socialPromoSchema = z
  .object({
    enabled: z.boolean(),
    inviteUrl: z.union([z.literal(""), z.string().trim().regex(DISCORD_INVITE_PATTERN)]),
    title: text(80),
    body: text(300),
    /** Début et fin d'affichage (ISO), facultatifs : sans eux, l'interrupteur suffit. */
    startsAt: isoDate,
    endsAt: isoDate,
  })
  .strict()
  // Activée sans lien : le bouton n'ouvrirait rien
  .refine((p) => !p.enabled || p.inviteUrl !== "", { message: "Lien d'invitation requis pour afficher la section" })
  .refine((p) => !p.startsAt || !p.endsAt || Date.parse(p.startsAt) < Date.parse(p.endsAt), {
    message: "La fin doit suivre le début",
  });

export type SocialPromoConfig = z.infer<typeof socialPromoSchema>;

export const SOCIAL_PROMO_DEFAULT: SocialPromoConfig = {
  enabled: false,
  inviteUrl: "",
  title: { fr: "Rejoins notre Discord", en: "Join our Discord" },
  body: {
    fr: "Annonces, échanges, entraide et événements entre joueurs : retrouve la communauté Kiraku.",
    en: "News, trades, help and events between players: meet the Kiraku community.",
  },
  startsAt: null,
  endsAt: null,
};

export type SocialPromoState = "OFF" | "SCHEDULED" | "LIVE" | "ENDED";

/** Où en est la section à `now` (récap de l'admin) ; seule « LIVE » est affichée aux joueurs. */
export function socialPromoState(config: SocialPromoConfig, now: Date): SocialPromoState {
  if (!config.enabled || config.inviteUrl === "") return "OFF";
  if (config.startsAt && Date.parse(config.startsAt) > now.getTime()) return "SCHEDULED";
  if (config.endsAt && Date.parse(config.endsAt) <= now.getTime()) return "ENDED";
  return "LIVE";
}

export function socialPromoVisible(config: SocialPromoConfig, now: Date): boolean {
  return socialPromoState(config, now) === "LIVE";
}
