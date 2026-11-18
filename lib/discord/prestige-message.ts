import { toRoman } from "@/lib/prestige/roman";
import { discordText, type DiscordMessageBody } from "./community";

// Annonces du prestige dans le salon Discord : une renaissance, une édition gravée tirée. Pur : le serveur fournit
// l'origine du site, le pseudo affichable (« Un joueur » pour un profil privé) et les données déjà relues en base.

const KIN = 0xd9b556;
const SHU = 0xc8372d;

function absolute(path: string, origin: string): string {
  return new URL(path, origin).href;
}

function discordImage(value: string, origin: string): { url: string } | undefined {
  try {
    const url = new URL(value, origin);
    if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password) return { url: url.href };
  } catch {
    // Une image invalide n'empêche pas l'annonce
  }
}

const ordinal = (rank: number) => (rank === 1 ? "1re" : `${rank}ᵉ`);

export type DiscordRebirth = {
  /** Pseudo affichable ; `username` seulement si le profil est public (lien vers le profil). */
  name: string;
  username: string | null;
  prestige: number;
  globalRank: number;
  heirs: number;
};

/** Une renaissance : le chiffre romain atteint et le rang global (« 7ᵉ renaissance de Kiraku »). */
export function rebirthMessage(r: DiscordRebirth, origin: string): DiscordMessageBody {
  const url = absolute(r.username ? `/u/${encodeURIComponent(r.username)}` : "/prestige", origin);
  return {
    content: `転生 **${discordText(r.name, 40)}** renaît au prestige **${toRoman(r.prestige)}**.`,
    embeds: [
      {
        title: `Prestige ${toRoman(r.prestige)} · ${ordinal(r.globalRank)} renaissance de Kiraku`.slice(0, 256),
        description: r.heirs > 0 ? `${r.heirs} héritière${r.heirs > 1 ? "s" : ""} gardée${r.heirs > 1 ? "s" : ""}, veinée${r.heirs > 1 ? "s" : ""} d'or.` : "Un nouveau cycle commence.",
        url,
        color: KIN,
      },
    ],
    components: [{ type: 1, components: [{ type: 2, style: 5, label: r.username ? "Voir le profil" : "Découvrir le prestige", url }] }],
    allowed_mentions: { parse: [] },
  };
}

export type DiscordEngraved = {
  name: string;
  seal: string | null;
  serial: number;
  size: number;
  /** `spoiler` : carte qui dévoile l'histoire, annoncée sans son illustration. */
  card: { name: string; imageUrl: string; rarityName: string; spoiler: boolean; anilistId: number };
};

/** Une édition gravée tirée : « 初摺 n° 17 / 25 », avec le lien vers le registre de la carte. */
export function engravedMessage(e: DiscordEngraved, origin: string): DiscordMessageBody {
  const url = absolute(`/wiki/${e.card.anilistId}`, origin);
  const edition = `${e.seal ? `${e.seal} ` : ""}n° ${e.serial} / ${e.size}`;
  const image = e.card.spoiler ? undefined : discordImage(e.card.imageUrl, origin);
  return {
    content: `版 **${discordText(e.name, 40)}** tire une édition gravée : **${discordText(e.card.name, 60)}** ${edition}.`,
    embeds: [
      {
        title: `${discordText(e.card.name, 80)} · ${discordText(e.card.rarityName, 35)}`.slice(0, 256),
        description: `Édition gravée ${edition}${e.serial === 1 ? " — le numéro 1 du tirage." : "."}`,
        url,
        color: SHU,
        ...(image && { image }),
        footer: { text: "Chaque numéro n'existe qu'une fois. Registre complet sur la fiche de la carte." },
      },
    ],
    components: [{ type: 1, components: [{ type: 2, style: 5, label: "Voir le registre", url }] }],
    allowed_mentions: { parse: [] },
  };
}
