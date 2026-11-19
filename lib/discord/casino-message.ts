import type { CoinSide } from "@/lib/casino/fairness";
import { SIDE_KANJI } from "@/lib/casino/media";
import { absolute, discordImage, discordText, KIN, SHU, type DiscordMessageBody } from "./community";

// Annonces du casino dans le salon Discord : teaser (posté depuis l'admin), ouverture (postée une fois par le
// cron à l'heure dite) et relais des gros lancers. Pur : le serveur fournit l'origine du site et les données.

/** Horodatage natif de Discord : chaque membre le lit dans son fuseau (`R` relatif, `F` date complète). */
const stamp = (at: Date, style: "R" | "F") => `<t:${Math.floor(at.getTime() / 1000)}:${style}>`;

/** Teaser : la façade fermée, et le compte à rebours si la date est fixée. */
export function casinoTeaserMessage(input: { opensAt: Date | null; origin: string }): DiscordMessageBody {
  const url = absolute("/casino", input.origin);
  const when = input.opensAt ? `Le casino ouvre ${stamp(input.opensAt, "R")}, ${stamp(input.opensAt, "F")}.` : "Le casino ouvre bientôt.";
  return {
    content: `🏮 **Quelque chose se prépare derrière les shōji.**\n${when}`,
    embeds: [
      {
        title: "Le casino de Kiraku",
        description: "Premier jeu : pile ou face entre joueurs. Une fuda contre une fuda du même palier, le gagnant garde les deux. Tout est virtuel, sans Zeni ni argent réel.",
        url,
        color: KIN,
        image: { url: absolute("/casino/discord/teaser-v1.jpg", input.origin) },
      },
    ],
    components: [{ type: 1, components: [{ type: 2, style: 5, label: "Voir le teaser", url }] }],
    allowed_mentions: { parse: [] },
  };
}

/** Ouverture : postée une seule fois, à l'heure dite, avec l'objectif commun s'il est réglé. */
export function casinoOpeningMessage(input: { origin: string; goal: number | null; reward: string | null }): DiscordMessageBody {
  const url = absolute("/casino", input.origin);
  const goal = input.goal ? `\nObjectif commun : **${new Intl.NumberFormat("fr-FR").format(input.goal)} lancers**${input.reward ? `, avec ${discordText(input.reward, 80)} pour tout le monde` : ""}.` : "";
  return {
    content: `🎉 **Le casino est ouvert !**\nPremier jeu : pile ou face entre joueurs. Pose une fuda, choisis 表 ou 裏, ou relève la table d'un autre joueur.${goal}`,
    embeds: [
      {
        title: "Entrer au casino",
        url,
        color: SHU,
        image: { url: absolute("/casino/discord/opening-v1.jpg", input.origin) },
        footer: { text: "Tout est virtuel : aucune somme réelle n'est en jeu." },
      },
    ],
    components: [{ type: 1, components: [{ type: 2, style: 5, label: "Entrer au casino", url }] }],
    allowed_mentions: { parse: [] },
  };
}

export type DiscordBigFlip = {
  id: string;
  /** Pseudo affichable du gagnant (« Un joueur » pour un profil privé). */
  winnerName: string;
  seal: string;
  result: CoinSide;
  /** `spoiler` : carte qui dévoile l'histoire, annoncée sans son illustration. */
  card: { name: string; imageUrl: string; rarityName: string; spoiler: boolean };
  /** Exemplaire spécial remporté (« Gravée 初摺 n° 17 / 25 · héritage 3 »), absent pour un ordinaire. */
  copy?: string | null;
};

/** Relais d'un gros lancer : qui remporte quelle fuda, sur quelle face, avec le lien vers la table jouée. */
export function bigFlipMessage(flip: DiscordBigFlip, origin: string): DiscordMessageBody {
  const url = absolute(`/casino/pile-ou-face/${encodeURIComponent(flip.id)}`, origin);
  const image = flip.card.spoiler ? undefined : discordImage(flip.card.imageUrl, origin);
  return {
    content: `🪙 **${discordText(flip.winnerName, 40)}** remporte une fuda ${flip.seal} au pile ou face.`,
    embeds: [
      {
        title: `${discordText(flip.card.name, 80)} · ${discordText(flip.card.rarityName, 35)}`.slice(0, 256),
        description: flip.copy ? `${discordText(flip.copy, 200)}\nLa pièce est tombée sur ${SIDE_KANJI[flip.result]}.` : `La pièce est tombée sur ${SIDE_KANJI[flip.result]}.`,
        url,
        color: KIN,
        ...(image && { image }),
        footer: { text: "Tirage vérifiable depuis la page de la table." },
      },
    ],
    components: [{ type: 1, components: [{ type: 2, style: 5, label: "Voir le lancer", url }] }],
    allowed_mentions: { parse: [] },
  };
}
