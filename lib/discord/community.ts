export const RULES_BUTTON_ID = "kiraku:rules:accept:v1";

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
  allowed_mentions: { parse: [] };
};

export function rulesMessage(): DiscordMessageBody {
  return {
    content: "🌸 **Bienvenue dans la communauté Kiraku !**\n\nLis le règlement ci-dessus, puis clique sur le bouton pour l’accepter et accéder aux salons.",
    components: [{ type: 1, components: [{ type: 2, style: 3, label: "✅ J’accepte le règlement", custom_id: RULES_BUTTON_ID }] }],
    allowed_mentions: { parse: [] },
  };
}

/** Texte des joueurs : pas de mise en forme, de liens cachés ou de mentions injectés. */
export function discordText(value: string, max = 256): string {
  return value.slice(0, max).replace(/[\r\n\t]/g, " ").replace(/([\\`*_{}\[\]()<>|~])/g, "\\$1");
}
