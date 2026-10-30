import type { DiscordMessageBody } from "./community";

/** Guide public du serveur Kiraku, indépendant de la base de données. */
export function gettingStartedMessage(baseUrl: string): DiscordMessageBody {
  const url = new URL(baseUrl);
  return {
    embeds: [{ title: "🌸 Bien débuter sur Kiraku", color: 0xc74636, description: [
      "Bienvenue ! Voici les étapes pour rejoindre la communauté et profiter du jeu.",
      "\n**1 · Accède aux salons**",
      "Lis <#1565778336947634266>, puis clique sur **J’accepte le règlement**. Termine aussi la validation native de Discord si elle t’est demandée.",
      "\n**2 · Retrouve ton compte Kiraku**",
      `Ouvre **${url.origin}**, puis crée ton compte ou connecte-toi. Depuis **Mon compte** (${url.origin}/compte), lie ton compte Discord pour recevoir le rôle **Joueur Kiraku vérifié**.`,
      "\n**3 · Choisis tes rôles**",
      "Dans <#1565778506120433664>, clique pour ajouter ou retirer **Marchand** (notifications des ventes et échanges), **Collectionneur** (intérêt pour la collection) ou **Fighter** (annonces des saisons). Le marché reste accessible aux membres sans rôle Marchand.",
      "\n**4 · Vends et échange tes cartes**",
      `Les ventes et échanges se font sur le **marché Kiraku** (${url.origin}/marche). <#1565793902324219925> relaie les nouvelles annonces avec un lien vers le jeu. Utilise <#1565778923785289809> pour organiser un échange avec d’autres joueurs.`,
      "\n**5 · Participe à la vie du jeu**",
      "Propose tes cartes **AR ou Gold** dans <#1565778878075773008> en suivant le modèle épinglé. Retrouve les bilans de saisons classées dans <#1565818050631176202> et les informations de l’équipe dans <#1565778481412051044>.",
      "\n**Besoin d’aide ?**",
      "Crée un sujet dans <#1565779037429825616>. Pour un bug, indique ce qui s’est passé, les étapes pour le reproduire et ajoute une capture si possible. Pour un problème personnel de compte, contacte l’équipe en privé ; ne partage jamais ton mot de passe ni tes codes de connexion.",
      "\nBonne collection et bons combats ! 🌸",
    ].join("\n") }],
    allowed_mentions: { parse: [] },
    components: [{ type: 1, components: [
      { type: 2, style: 5, label: "Jouer à Kiraku", url: url.origin },
      { type: 2, style: 5, label: "Mon compte", url: `${url.origin}/compte` },
      { type: 2, style: 5, label: "Marché", url: `${url.origin}/marche` },
    ] }],
  };
}
