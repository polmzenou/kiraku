import { z } from "zod";

// Modal « Rejoins notre Discord » (étape 10) : désactivé par défaut, piloté depuis /admin/discord.
// Distinct de la connexion Discord du compte.

/** Lien d'invitation accepté : https://discord.gg/… ou https://discord.com/invite/… (rien d'autre). */
export const DISCORD_INVITE_PATTERN = /^https:\/\/(?:discord\.gg|discord\.com\/invite)\/[A-Za-z0-9-]{2,32}\/?$/;

export const JOIN_MODAL_TRIGGERS = ["AFTER_BOOSTERS", "ON_VISIT"] as const;
export type JoinModalTrigger = (typeof JOIN_MODAL_TRIGGERS)[number];

const text = (max: number) => z.object({ fr: z.string().trim().min(1).max(max), en: z.string().trim().max(max) }).strict();

export const joinModalSchema = z
  .object({
    enabled: z.boolean(),
    inviteUrl: z.union([z.literal(""), z.string().trim().regex(DISCORD_INVITE_PATTERN)]),
    title: text(80),
    body: text(300),
    trigger: z.enum(JOIN_MODAL_TRIGGERS),
    afterBoosters: z.number().int().min(1).max(1_000),
    // Ne le remontre pas avant N jours après un « Plus tard »
    cooldownDays: z.number().int().min(0).max(365),
    showInFooter: z.boolean(),
  })
  .strict()
  // Activé sans lien : rien ne pourrait s'ouvrir
  .refine((m) => !m.enabled || m.inviteUrl !== "", { message: "Lien d'invitation requis pour activer le modal" });

export type JoinModalConfig = z.infer<typeof joinModalSchema>;

export const JOIN_MODAL_DEFAULT: JoinModalConfig = {
  enabled: false,
  inviteUrl: "",
  title: { fr: "Rejoins notre Discord", en: "Join our Discord" },
  body: { fr: "Annonces, échanges et entraide entre joueurs.", en: "News, trades and help between players." },
  trigger: "AFTER_BOOSTERS",
  afterBoosters: 3,
  cooldownDays: 7,
  showInFooter: true,
};

/** Clé localStorage du dernier « Plus tard » (préférence exemptée, voir lib/consent/registry.ts). */
export const JOIN_LATER_KEY = "kiraku.discord-later";
const DAY_MS = 86_400_000;

/** Côté serveur : le joueur peut voir le modal (sans le délai « Plus tard », lu dans le navigateur). */
export function joinModalEligible(
  config: JoinModalConfig,
  player: { discordJoinedAt: Date | null; boostersOpened: number },
): boolean {
  if (!config.enabled || config.inviteUrl === "" || player.discordJoinedAt) return false;
  return config.trigger === "ON_VISIT" || player.boostersOpened >= config.afterBoosters;
}

/** Côté navigateur : pas de « Plus tard » depuis moins de `cooldownDays` jours. */
export function laterCooldownOver(laterAt: number | null, cooldownDays: number, now: number): boolean {
  if (laterAt === null || !Number.isFinite(laterAt)) return true;
  return now - laterAt >= cooldownDays * DAY_MS;
}
