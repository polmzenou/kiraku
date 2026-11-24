import { absolute, KIN, SHU, type DiscordMessageBody } from "./community";

// Annonce du lancement à la communauté (design « Annonce détaillée » de l'atelier équipe) : publiée depuis l'admin dans
// le salon des annonces, avec @everyone. Un encadré pour le nouveau parrainage (ce que reçoit chacun à chaque étape), un
// pour l'Ennichi s'il est annoncé ou en cours (bonus, lanternes, banzuke, omikuji), et un bouton « Inviter un ami ».
// Pur : le serveur fournit les textes des lots (montants réglés en ce moment) et l'origine du site.

export type AnnounceStep = { kanji: string; say: string; friend: string | null; you: string | null };
export type AnnounceEnnichi = {
  /** Fête en cours (« commence ») ou seulement annoncée (« arrive le … »). */
  live: boolean;
  startsAt: Date;
  days: number;
  multiplier: number;
  tiers: { lanterns: number; gifts: string }[];
  ranks: { label: string; gifts: string }[];
  /** Cagnotte de l'omikuji en une ligne. */
  pool: string | null;
};

const nf = new Intl.NumberFormat("fr-FR");
/** Horodatage natif de Discord : chaque membre le lit dans son fuseau. */
const stamp = (at: Date) => `<t:${Math.floor(at.getTime() / 1000)}:F>`;
/** Discord : 1 024 caractères au plus par champ. */
const field = (name: string, lines: (string | null)[]) => ({ name: name.slice(0, 256), value: (lines.filter(Boolean).join("\n") || "—").slice(0, 1024) });

export function referralLaunchMessage(input: { steps: AnnounceStep[]; ennichi: AnnounceEnnichi | null; origin: string }): DiscordMessageBody {
  const url = absolute("/parrainage", input.origin);
  const embeds: NonNullable<DiscordMessageBody["embeds"]> = [
    {
      title: "Le parrainage change",
      description: "**Le parrainage de Kiraku change.** Invite un ami : vous gagnez tous les deux, à chaque étape de son arrivée. Les cadeaux tombent tout seuls.",
      url,
      color: SHU,
      fields: input.steps.map((s) => field(`${s.kanji} ${s.say}`, [`Pour lui : ${s.friend ?? "rien"}`, `Pour toi : ${s.you ?? "rien"}`])),
      image: { url: absolute("/images/referral/discord-annonce-v1.jpg", input.origin) },
    },
  ];
  const e = input.ennichi;
  if (e) {
    embeds.push({
      title: e.live ? "L'Ennichi commence" : "L'Ennichi arrive",
      description: `${e.live ? "**L'Ennichi commence !**" : `**L'Ennichi arrive le ${stamp(e.startsAt)}.**`} ${e.days} jours de fête : chaque ami allume une lanterne, et des cadeaux tombent pour tout le monde. Classement des recruteurs et tombola le dernier soir.`,
      url: absolute("/ennichi", input.origin),
      color: KIN,
      fields: [
        ...(e.multiplier > 1 ? [field(`倍 ×${e.multiplier} sur les étapes 1 et 2`, [`Pendant les ${e.days} jours de la fête, pour lui comme pour toi`])] : []),
        field("灯 Lanternes", e.tiers.map((t) => `${nf.format(t.lanterns)} lanternes : ${t.gifts} pour tous`)),
        field("番 Banzuke", e.ranks.map((r) => `${r.label} : ${r.gifts}`)),
        ...(e.pool ? [field("籤 Omikuji", [`${e.pool}, un ticket par ami installé`])] : []),
      ],
      image: { url: absolute("/images/referral/discord-ennichi-v1.jpg", input.origin) },
    });
  }
  return {
    content: "@everyone",
    embeds,
    components: [{ type: 1, components: [{ type: 2, style: 5, label: "Inviter un ami", url }] }],
    allowed_mentions: { parse: ["everyone"] },
  };
}

/** « 1er », « 2e et 3e », « 4e à 10e » : la ligne d'un rang du banzuke. */
export function rankLabel(from: number, to: number): string {
  const ord = (n: number) => `${n}${n === 1 ? "er" : "e"}`;
  if (from === to) return ord(from);
  return to === from + 1 ? `${ord(from)} et ${ord(to)}` : `${ord(from)} à ${ord(to)}`;
}
