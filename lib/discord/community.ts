export const RULES_BUTTON_ID = "kiraku:rules:accept:v1";
export const VERIFY_BUTTON_ID = "kiraku:account:verify:v1";
export const SELF_ROLE_PREFIX = "kiraku:role:";

export type SelfRole = { key: "merchant" | "collector" | "fighter"; id: string; label: string; description: string };

export type DiscordMessageBody = {
  content?: string;
  embeds?: Array<{
    title?: string;
    description?: string;
    url?: string;
    color?: number;
    image?: { url: string };
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    footer?: { text: string };
  }>;
  components?: Array<{ type: 1; components: Array<{
    type: 2;
    style: number;
    label: string;
    custom_id?: string;
    url?: string;
  }> }>;
  attachments?: Array<{ id: number; filename: string }>;
  // « everyone » : seulement l'annonce du lancement du parrainage, publiée à la main depuis l'admin
  allowed_mentions: { parse: [] | ["everyone"]; roles?: string[] };
};

export function rulesMessage(): DiscordMessageBody {
  return {
    content: "🌸 **Bienvenue dans la communauté Kiraku !**\n\nLis le règlement ci-dessus, puis clique sur le bouton pour l’accepter et accéder aux salons.",
    components: [{ type: 1, components: [{ type: 2, style: 3, label: "✅ J’accepte le règlement", custom_id: RULES_BUTTON_ID }] }],
    allowed_mentions: { parse: [] },
  };
}

export function rolesMessage(roles: readonly SelfRole[]): DiscordMessageBody {
  return {
    content: "🌸 **Choisis tes rôles Kiraku**\n\n" + roles.map((role) => `• **${role.label}** : ${role.description}`).join("\n") +
      "\n\nClique pour ajouter ou retirer un rôle. Marchand concerne les notifications : le marché reste accessible aux membres.\n\n**Compte lié** : lie Discord depuis ton compte Kiraku, puis utilise « Vérifier mon compte » si nécessaire.",
    components: [
      ...(roles.length ? [{ type: 1 as const, components: roles.map((role) => ({ type: 2 as const, style: 2, label: role.label, custom_id: `${SELF_ROLE_PREFIX}${role.key}` })) }] : []),
      { type: 1, components: [{ type: 2, style: 1, label: "🔗 Vérifier mon compte", custom_id: VERIFY_BUTTON_ID }] },
    ],
    allowed_mentions: { parse: [] },
  };
}

/**
 * Texte des joueurs : pas de mise en forme, de liens (cachés ou en clair) ni de mentions injectés. La barre oblique est
 * échappée aussi : un nom Discord « https://… » ou « discord.gg/… » deviendrait sinon un lien cliquable dans le message
 * du bot (Discord l'affiche telle quelle, sans la barre inverse).
 */
export function discordText(value: string, max = 256): string {
  return value.slice(0, max).replace(/[\r\n\t]/g, " ").replace(/([\\`*_{}\[\]()<>|~/])/g, "\\$1");
}

/** Couleurs des encadrés : or (kin) et vermillon (shu) de la DA. */
export const KIN = 0xd9b556;
export const SHU = 0xc8372d;

/** Lien absolu vers une page du site. */
export function absolute(path: string, origin: string): string {
  return new URL(path, origin).href;
}

/** Image d'un encadré : http(s) sans identifiants seulement ; une image invalide n'empêche pas l'annonce. */
export function discordImage(value: string, origin: string): { url: string } | undefined {
  try {
    const url = new URL(value, origin);
    if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password) return { url: url.href };
  } catch {
    // Une image invalide n'empêche pas l'annonce
  }
}
