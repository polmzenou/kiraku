import { reasonWeight, type Reason } from "@/lib/anticheat/score";
import { absolute, discordText, KIN, SHU, type DiscordMessageBody } from "./community";

// Fil du parrainage v2 dans le salon Discord privé de l'équipe (DISCORD_REFERRAL_CHANNEL_ID ; design « message
// détaillé » de l'atelier équipe) : chaque étape versée (les deux côtés, les stats des deux joueurs, la paire), chaque
// part « confiance », palier ou grand-parrainage versé à part, chaque parrainage mis « À vérifier » et chaque décision
// de l'équipe. Pur : le serveur fournit les données déjà relues et les lots déjà écrits en texte. Aucune IP n'est
// envoyée : appareil et IP communs ne sont dits que par oui ou non.

const HISUI = 0x5bbf8b;
const GRIS = 0x6b645a;
const FOOTER = { text: "Parrainage v2 · aucune IP en clair" };
const STEP_KANJI = ["一", "二", "三", "四"] as const;
const STEP_NAME = ["Arrivée", "Installé", "Accro", "Fidèle"] as const;
const STEP_DONE = ["a créé son compte", "est installé", "est accro", "est fidèle"] as const;

export type FeedReferee = {
  name: string;
  /** Âge du compte, en jours. */
  accountDays: number;
  via: "DISCORD" | "EMAIL" | "NONE";
  /** Âge du compte Discord, en jours, s'il est connu. */
  discordDays: number | null;
  trust: "HIGH" | "MEDIUM";
  /** Boosters ouverts hors cadeau depuis le rattachement, et jours actifs. */
  openings: number;
  activeDays: number;
};
export type FeedReferrer = { name: string; installed: number; milestones: number; received: { zeni: number; boosters: number; vouchers: number } };
export type FeedPair = { sharedDevice: boolean; sharedIp: boolean; score: number };
export type FeedReferral = { referralId: string; referee: FeedReferee; referrer: FeedReferrer; pair: FeedPair };

const nf = new Intl.NumberFormat("fr-FR");
const plural = (n: number, one: string, many: string) => `${nf.format(n)} ${n > 1 ? many : one}`;

/**
 * Indice du score de la paire, en clair et avec son poids (« Même appareil +60 ») : jamais d'adresse IP, de boîte
 * e-mail ou de pseudo, seulement leur nombre ou leur nature.
 */
export function clueText(r: Reason): string {
  const label = ((): string => {
    switch (r.kind) {
      case "device":
        return r.count > 1 ? `Mêmes appareils (${r.count})` : "Même appareil";
      case "ip":
        return r.values.length > 1 ? `IP communes (${r.values.length})` : "IP commune";
      case "emailAlias":
        return "Même boîte e-mail (alias)";
      case "emailStem":
        return "E-mails très proches";
      case "usernameStem":
        return "Pseudos très proches";
      case "flow":
        return "Transferts à sens unique";
      case "interactions":
        return `Beaucoup d'échanges (${r.total})`;
      case "createdClose":
        return `Comptes créés à ${r.minutes} min d'écart${r.withIp ? ", même IP" : ""}`;
      case "referral":
        return "Parrainage";
      case "onlyFriend":
        return "Ami unique";
    }
  })();
  return `${label} +${reasonWeight(r)}`;
}

/** « moins d'un jour », « 12 jours », « 5 mois », « 2 ans ». */
export function ageText(days: number): string {
  if (days >= 365) return plural(Math.floor(days / 365), "an", "ans");
  if (days >= 30) return `${nf.format(Math.floor(days / 30))} mois`;
  if (days >= 1) return plural(Math.floor(days), "jour", "jours");
  return "moins d'un jour";
}

function refereeLine(r: FeedReferee): string {
  const via = r.via === "DISCORD" ? `Discord${r.discordDays !== null ? ` (compte de ${ageText(r.discordDays)})` : ""}` : r.via === "EMAIL" ? "e-mail seul" : "non vérifié";
  return `compte de ${ageText(r.accountDays)} · ${via} · confiance ${r.trust === "HIGH" ? "haute" : "moyenne"}`;
}

function referrerLine(p: FeedReferrer): string {
  const got = [
    p.received.zeni > 0 ? `${nf.format(p.received.zeni)} Zeni` : null,
    p.received.boosters > 0 ? plural(p.received.boosters, "booster", "boosters") : null,
    p.received.vouchers > 0 ? plural(p.received.vouchers, "bon", "bons") : null,
  ].filter(Boolean);
  return `${plural(p.installed, "ami installé", "amis installés")} · ${plural(p.milestones, "palier", "paliers")} · reçu : ${got.length ? got.join(", ") : "rien encore"}`;
}

const pairLine = (p: FeedPair) => `appareil commun : ${p.sharedDevice ? "oui" : "non"} · IP commune : ${p.sharedIp ? "oui" : "non"} · score ${nf.format(p.score)}`;
/** Champ d'encadré : le libellé est écrit par nous, seuls les pseudos qu'il contient sont échappés par l'appelant. */
const field = (name: string, value: string, inline = false) => ({ name: name.slice(0, 256), value: value.slice(0, 1024) || "—", inline });
const who = (name: string) => discordText(name, 40);
const ficheUrl = (referralId: string, origin: string) => absolute(`/admin/parrainage/suivi/${encodeURIComponent(referralId)}`, origin);

function message(title: string, color: number, url: string, description: string, fields: ReturnType<typeof field>[], buttons: { label: string; url: string }[]): DiscordMessageBody {
  return {
    embeds: [{ title: title.slice(0, 256), description: description.slice(0, 4096), url, color, fields, footer: FOOTER }],
    components: [{ type: 1, components: buttons.map((b) => ({ type: 2 as const, style: 5 as const, label: b.label, url: b.url })) }],
    allowed_mentions: { parse: [] },
  };
}

const pairTitle = (f: FeedReferral) => `${discordText(f.referee.name, 40)} → ${discordText(f.referrer.name, 40)}`;
const playerFields = (f: FeedReferral) => [
  field(who(f.referee.name), refereeLine(f.referee)),
  field("Activité", `${plural(f.referee.openings, "booster hors cadeau", "boosters hors cadeau")} · ${plural(f.referee.activeDays, "jour actif", "jours actifs")}`),
  field("Paire", pairLine(f.pair)),
  field(who(f.referrer.name), referrerLine(f.referrer)),
];

/** Une étape versée : ce que chacun a reçu, l'Ennichi, puis les stats des deux joueurs et de la paire. */
export function stepPayoutMessage(
  f: FeedReferral & { step: 1 | 2 | 3 | 4; toReferee: string | null; toReferrer: string | null; trustKept: boolean; multiplier: number },
  origin: string,
): DiscordMessageBody {
  const i = f.step - 1;
  const url = ficheUrl(f.referralId, origin);
  const toReferrer = `${f.toReferrer ?? "rien pour l'instant"}${f.trustKept ? " · part « confiance » gardée pour l'étape 3" : ""}`;
  return message(
    `${STEP_KANJI[i]} Étape ${f.step} · ${STEP_NAME[i]} · ${pairTitle(f)}`,
    HISUI,
    url,
    `**${discordText(f.referee.name, 40)}** ${STEP_DONE[i]}.`,
    [
      field(`Versé au filleul (${who(f.referee.name)})`, f.toReferee ?? "rien", true),
      field(`Versé au parrain (${who(f.referrer.name)})`, toReferrer, true),
      field("Ennichi", f.multiplier > 1 ? `oui · ×${f.multiplier}` : "non", true),
      ...playerFields(f),
    ],
    [{ label: "Ouvrir dans l'admin", url }],
  );
}

/** Part « confiance » versée à part (Discord ancien lié après coup) : ce que le parrain reçoit. */
export function trustPayoutMessage(f: FeedReferral & { step: number; toReferrer: string | null }, origin: string): DiscordMessageBody {
  const url = ficheUrl(f.referralId, origin);
  return message(
    `信 Part « confiance » · ${pairTitle(f)}`,
    KIN,
    url,
    `Part de l'étape ${f.step}, versée au parrain : ${discordText(f.referee.name, 40)} a maintenant un Discord de confiance.`,
    [field(`Versé au parrain (${who(f.referrer.name)})`, f.toReferrer ?? "rien"), ...playerFields(f)],
    [{ label: "Ouvrir dans l'admin", url }],
  );
}

/** Palier du parrain franchi : son lot et ses extras (bons, carte 1/1, Ambassadeur proposé, mur des légendes). */
export function milestonePayoutMessage(
  f: { referralId: string | null; referrer: FeedReferrer; milestone: number; reward: string | null; extras: string[] },
  origin: string,
): DiscordMessageBody {
  const url = f.referralId ? ficheUrl(f.referralId, origin) : absolute("/admin/parrainage/suivi", origin);
  const got = [f.reward, ...f.extras].filter(Boolean).join(" · ");
  return message(
    `階 Palier de ${plural(f.milestone, "ami", "amis")} · ${discordText(f.referrer.name, 40)}`,
    KIN,
    url,
    "Lot versé tout seul.",
    [field(`Versé à ${who(f.referrer.name)}`, got || "rien (badge et cadre seulement)"), field(who(f.referrer.name), referrerLine(f.referrer))],
    [{ label: "Ouvrir dans l'admin", url }],
  );
}

/** Grand-parrainage : le filleul d'un filleul est installé, son grand-parrain reçoit son lot. */
export function grandPayoutMessage(f: { referralId: string; referee: string; referrer: string; grand: string; reward: string | null }, origin: string): DiscordMessageBody {
  const url = ficheUrl(f.referralId, origin);
  return message(
    `孫 Grand-parrainage · ${discordText(f.grand, 40)}`,
    KIN,
    url,
    `Le filleul de ${discordText(f.referrer, 40)} (${discordText(f.referee, 40)}) est installé.`,
    [field(`Versé à ${who(f.grand)}`, f.reward ?? "rien")],
    [{ label: "Ouvrir dans l'admin", url }],
  );
}

/** Parrainage mis « À vérifier » : ses indices, le score de la paire, les étapes qui attendent la décision. */
export function holdMessage(
  f: FeedReferral & { reason: "DEVICE" | "SCORE"; clues: string[]; threshold: number; waitingSteps: number[] },
  origin: string,
): DiscordMessageBody {
  const url = ficheUrl(f.referralId, origin);
  const waiting = f.waitingSteps.length ? `étape${f.waitingSteps.length > 1 ? "s" : ""} ${f.waitingSteps.join(", ")}, rien versé` : "rien pour l'instant";
  return message(
    `待 À vérifier · ${pairTitle(f)}`,
    SHU,
    url,
    "Rien n'est versé tant que l'équipe n'a pas décidé.",
    [
      field("Motif", f.reason === "DEVICE" ? "même appareil" : "score de la paire", true),
      field("Score de la paire", `${nf.format(f.pair.score)} (seuil ${nf.format(f.threshold)})`, true),
      field("En attente", waiting, true),
      field("Indices", f.clues.length ? f.clues.join(" · ") : "aucun autre"),
      ...playerFields(f),
    ],
    [
      { label: "Ouvrir dans l'admin", url },
      { label: "Voir la file", url: absolute("/admin/parrainage", origin) },
    ],
  );
}

/** Décision de l'équipe : validé (et versé), révoqué, ou révoqué et banni avec ce qui a été repris. */
export function decisionMessage(
  f: { referralId: string; referee: string; referrer: string; decision: "VALIDATED" | "REVOKED" | "BANNED"; by: string; reason: string | null; taken: string | null },
  origin: string,
): DiscordMessageBody {
  const url = ficheUrl(f.referralId, origin);
  const title = f.decision === "VALIDATED" ? "Parrainage validé" : f.decision === "BANNED" ? "Révoqué et banni" : "Révoqué";
  const fields = [
    ...(f.reason ? [field("Raison", discordText(f.reason, 300))] : []),
    ...(f.decision === "BANNED" ? [field("Repris", f.taken ?? "rien")] : []),
    ...(f.decision === "REVOKED" ? [field("Suite", "Plus rien ne sera versé ; ce qui a été reçu reste.")] : []),
    ...(f.decision === "VALIDATED" ? [field("Suite", "Tout ce qui était dû est versé.")] : []),
  ];
  return message(
    `決 ${title} · ${discordText(f.referee, 40)} → ${discordText(f.referrer, 40)}`,
    f.decision === "VALIDATED" ? HISUI : f.decision === "BANNED" ? SHU : GRIS,
    url,
    `Par ${discordText(f.by, 40)}.`,
    fields,
    [{ label: "Ouvrir dans l'admin", url }],
  );
}
