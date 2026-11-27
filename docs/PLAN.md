# Kiraku — Plan technique

Oct 13, 2026 · @Kata

## Vue d'ensemble

L'appli tient en six briques qui partagent une seule base Postgres : boosters, collection, profil social, monnaie, hôtel des ventes et combat. Tout ce qui touche au hasard et à l'argent virtuel se calcule côté serveur, dans des transactions.

| Brique | Ce que fait l'utilisateur | Règle clé |
| --- | --- | --- |
| Boosters | Ouvre un booster de 6 cartes | 10 au départ, +1 toutes les 10 min, max 10 |
| Collection | Parcourt ses cartes, filtre, voit ses doublons | Chaque carte obtenue = une instance unique |
| Profil | Ajoute des amis, consulte leurs profils | Demande puis acceptation |
| Vitrines | Plusieurs vitrines par joueur, chacune avec son nom, sa disposition et son thème ; une seule, la principale, est publique | 6 par joueur (réglable : `showcase.maxPerPlayer`), 16 dispositions de 1 à 20 cartes, 7 thèmes réglés dans `/admin/vitrines`, cartes possédées uniquement |
| Enchères | Met une carte en vente, enchérit | Prix fixés par les joueurs, carte et Zeni bloquées pendant la vente |
| Combat | Défie un joueur en 1v1 | Résolu par le serveur, rejoué en animation |

### Inspirations : ce qu'on garde de Kyara

Kiraku reprend les idées et la disposition de Kyara (en-tête avec stock et monnaie, grille de tuiles, accueil en sections, récap d'ouverture, page des raretés), jamais son visuel : couleurs, typographie, cartes, paquets et icônes suivent la direction artistique Kiraku décrite plus bas.

Kyara est une appli JavaScript : sans navigateur, seuls ses titres et métadonnées sont lisibles, mais ils montrent le mécanisme clé. Son catalogue vient d'AniList et la rareté d'un personnage dépend de son nombre de favoris.

| Élément | Kyara | Ce plan |
| --- | --- | --- |
| Boosters | Gratuits, un toutes les 10 min, stock max 15, pitié Mythique à 250 | Un toutes les 10 min, 10 max |
| Catalogue | 6 736 personnages, chacun numéroté par rang (#0001/6736) | Même principe, importé d'AniList |
| Identifiants | `/wiki/40` = Luffy, `/wiki/127691` = Gojo : ce sont les ids de personnages AniList | `Card.anilistId` |
| Rareté | 6 niveaux, Commune → Mythique, selon le rang : Gojo #1 et Luffy #3 Mythiques, Kaiji #500 et Konata #501 Légendaires | Mêmes paliers et mêmes taux (section Raretés) |
| Fiche wiki | Rareté, séries, apparitions, chance d'obtention ; débloquée en obtenant la carte | `/wiki/[anilistId]` |
| Pages | Accueil, wiki, marché, raretés, règles, classement, nouveautés | Les mêmes + amis, vitrine, combat |
| Échanges | Échange de cartes et vente au marché, cadeaux entre amis | Enchères + cadeaux entre amis |
| Règles | Un compte par personne, score de confiance, contestation des sanctions | Anti-multicomptes (section sécurité) |

Tes captures complètent le reste : taux, cadres, composition et recyclage sont dans la section Raretés ; accueil, récap d'ouverture et carte sont dans la section Écrans.

## Direction artistique Kiraku

Kiraku (気楽, « l'esprit léger ») est un **sanctuaire de papier** : la nuit : fond d'encre sumi, papier washi, sceaux vermillon et feuille d'or. Les boosters sont des **sachets scellés classiques, imprimés du motif traditionnel de leur famille et portant une étiquette de papier verticale (tanzaku) ; les cartes sont** des **fuda** (札, amulettes de papier). Tout le visuel est propre à Kiraku ; la planche [Kiraku — Direction artistique](https://claude.ai/artifact/5F351xJiejSxJk3e52cF3a) le montre.

**Couleurs.** Thème sombre « Yoru » (夜) **par défaut**, thème clair « Washi » en option dans le Compte. Les cartes (fuda) restent en papier clair dans les deux thèmes, ce qui les fait ressortir sur le fond sombre.

| Rôle | Kanji | Yoru (défaut) | Washi (option) | Usage |
| --- | --- | --- | --- | --- |
| Fond | 夜 / 和紙 | #15120F | #F3ECDF | Fond de page, grain de papier léger |
| Surface | 墨 / 生成 | #221D18 | #E9E0CC | Panneaux, barres, tuiles |
| Surface 2 | — | #2B251F | #E2D7C0 | Tuiles imbriquées |
| Bordure | — | #3A322A | #D9CFBC | Séparateurs |
| Texte | 和紙 / 墨 | #F1E9DA | #1F1B17 | Texte principal |
| Texte secondaire | 鼠 | #A89F92 | #6B645A | Légendes |
| Shu | 朱 | #E0533F (boutons #C8372D) | #C8372D | Accent : sceaux, bouton Ouvrir, alertes |
| Ai | 藍 | #7FA3D1 | #1E3557 | Liens, informations |
| Kin | 金 | #D9B556 | #B08A2E | Zeni, récompenses |

**Raretés = matières.** Chaque rareté a un sceau kanji et une matière de cadre, à la place des lettres et des couleurs vives.

| Rareté | Sceau | Cadre | Effet |
| --- | --- | --- | --- |
| Commune | 並 | Washi nu, liseré gris #9A9184 | Aucun |
| Peu commune | 良 | Bambou, vert #5C7F45 | Fibres de papier visibles |
| Rare | 稀 | Teinture indigo, #2C5A86 | Motif seigaiha (vagues) dans le cadre |
| Épique | 秀 | Laque violette, #6E4796 | Reflet laqué qui glisse avec l'inclinaison |
| Légendaire | 金 | Feuille d'or, #B8902F | Paillettes d'or qui scintillent |
| Mythique | 神 | Nacre (raden 螺鈿) | Irisation nacrée qui suit le téléphone, sceau animé |

Au-dessus de Mythique, des variantes (carte de base et image propre), détaillées dans `docs/admin-catalogue.md` : BR 闇, AR 異, VR 彩, Gold 煌, MR 漫, **Esprit 霊** et XR 極. Rangs : BR = Mythique < AR = VR < Gold = MR < Esprit < XR. L'Esprit est une carte spectrale sans cadre : l'illustration se déforme et ses bords se dissolvent comme un fantôme (canvas WebGL sur les grandes cartes animées, bord brumeux fixe ailleurs), et elle apparaît comme un fantôme à la révélation.

**Typographie.** Toutes sur Google Fonts, sans police monospace.

- Titres h1 et h2 : **Dela Gothic One**, un gothique japonais très gras, façon affiche de jeu.
- Autres titres (h3, logo, chiffres de classement) : **Shippori Mincho B1** (700–800), un mincho japonais avec un latin élégant.
- Texte et chiffres : **Zen Kaku Gothic New** (400–700), chiffres tabulaires.
- Kanji des sceaux et emblèmes : **Yuji Syuku**, tracé au pinceau.

**Motifs (wagara).** Chaque famille de boosters a son motif traditionnel, dessiné en CSS : seigaiha (vagues), asanoha (chanvre), shippō (cercles entrelacés), ichimatsu (damier), uroko (écailles), yagasuri (flèches), kumo (nuages), sakura.

**Éléments signature.**

- **Logo** : « Kiraku » en Shippori Mincho et un sceau carré vermillon 気楽.
- **Zeni** : une pièce dorée ronde à trou carré (銭), jamais un losange.
- **Stock de boosters** : un ensō (円相, cercle tracé au pinceau) qui se referme pendant les 10 min, « 7/10 » au centre.
- **Nouveau** : un sceau vermillon 新 qui se tamponne sur la carte, légèrement penché.
- **Titres de section** : un kanji vertical à gauche (縦書き) et un trait de pinceau sous le titre.
- **Boutons** : coins de 6 px, ombre « papier » décalée (0 3px 0, noire en Yoru), Ouvrir en vermillon.
- **Booster** : un sachet métallisé classique, bords sertis en dents de scie, reflet diagonal. Chaque booster a sa propre couleur et son propre motif wagara (planche « Choix du booster »), réglables dans l'admin. Au centre, une étiquette tanzaku en washi porte le kanji au pinceau, un trait vermillon et la contenance en japonais (四枚入, « 4 cartes ») ; en haut, le petit sceau Kiraku. Deux formats spéciaux : le pochibukuro (enveloppe à rabat, 2 cartes) et le jūbako (boîte laquée à étages, 20 cartes). À l'ouverture, on déchire la bande du haut d'un glissement de doigt et les fuda sortent une à une.
- **Carte (fuda)** : format 5:7, cadre dans la matière de sa rareté, sceau en haut à gauche, numéro « No. 0204 », nom japonais écrit verticalement le long de l'illustration, nom latin et série en bas, stats **力 Puissance** et **気 Ki**.

**Ce qu'on ne reprend pas de Kyara** : le fond noir par défaut, l'orange et le jaune, les pastilles rondes à lettre, les polices mono, le losange de monnaie, le cadre arc-en-ciel, la jauge horizontale de stock, les noms POW et AURA.

## Stack et architecture

Next.js App Router + Server Actions suffit : pas besoin d'API séparée. Le client n'envoie que des intentions (« ouvrir un booster », « enchérir ») ; le serveur décide de tout.

&#91;embedded content: architecture · 6 composants\]

La tâche planifiée appelle une route du serveur ; elle ne parle jamais directement à la base.

| Besoin | Choix | Pourquoi |
| --- | --- | --- |
| Framework | Next.js App Router, TypeScript | Server Components pour les pages, Server Actions pour les mutations |
| ORM | Prisma + `@prisma/adapter-pg` | Driver `pg` en TCP, transactions interactives OK ; TLS vérifié avec la CA Supabase épinglée (`server/pg-adapter.ts`) |
| BDD | Supabase Postgres (Neon jusqu'au 25/10/2026) | Pooler en mode transaction (6543) au runtime, mode session (5432) pour les migrations ; Data API désactivée, RLS active sans politique |
| Auth | Auth.js (NextAuth) + adaptateur Prisma | Discord/Google en un clic, sessions en base |
| Validation | Zod | Chaque Server Action valide ses entrées |
| Images | Vercel Blob ou Cloudinary + `next/image` | WebP redimensionné, servi par CDN |
| Anti-abus | Rate limit en base (table `RateLimit`, `server/ratelimit.ts`) | Limite ouvertures, enchères, défis ; lectures et sondages limités en mémoire, sans requête |
| UI | Tailwind + Framer Motion | Animation d'ouverture et effet holo des cartes |
| Temps réel | Ably (`ABLY_API_KEY`, facultatif en dev) | Combat en direct : le serveur publie, les navigateurs s'abonnent avec un jeton limité |

Mets la région de la base et la région des fonctions Vercel au même endroit (Supabase eu-west-1, c'est-à-dire Dublin, et Vercel `dub1` dans `vercel.json`) : c'est le gain de latence le plus simple.

## Écrans et navigation (mobile first)

Tout se conçoit d'abord pour un écran de 375 px, puis s'élargit : sur desktop, ce sont les mêmes pages avec plus de colonnes, pas des pages à part. La structure reprend celle de Kyara (en-tête avec stock, monnaie et notifications, puis une grille de tuiles) et y ajoute tes écrans.

| Écran | Route | Origine | Contenu |
| --- | --- | --- | --- |
| Boosters (accueil) | `/` | Kyara | Choix du booster par famille, stock, compte à rebours ; `/boosters` redirige ici |
| Ouverture | `/ouvrir/[slug]` | Kyara + toi | Rituel d'ouverture animé, révélation des cartes, récap |
| Compte | `/compte` | Kyara | Avatar, pseudo, lier Discord, stats (Zeni, cartes, pitié), grille de tuiles |
| Collection | `/collection` | Kyara | Filtres rareté/série, doublons, recyclage |
| Marché | `/marche` | Kyara + toi | Enchères, achat immédiat, mes ventes ; « Mettre une carte en vente » directement depuis les onglets de ventes |
| Combat | `/combat`, `/combat/[id]` | Toi | Défis reçus, choix d'équipe, replay, historique, rang classé |
| Mes decks | `/combat/decks` | Toi | Créer, modifier, renommer et supprimer ses équipes nommées (privé) |
| Atelier | `/combat/atelier` | Toi | Changer les passifs et la technique d'une carte : achat en Zeni pour cette carte, rééquipement gratuit |
| Profil public | `/u/[username]` | Kyara + toi | Vitrine principale (et, pour soi, accès rapide aux vitrines privées `/u/[username]/vitrines/[id]`), stats, bouton défier / ajouter |
| Amis | `/amis` | Kyara + toi | Demandes, cadeaux, défier un ami |
| Social | `/social` | Toi | Chercher un joueur, l'ajouter ou lui proposer un échange depuis le résultat, top 10 collectionneurs, section Discord (`discord.socialPromo`, masquée par défaut) ; menu « Plus » au-dessus de Casino |
| Missions | `/missions` | Kyara | Objectifs du jour et de la semaine, récompenses |
| Parrainage | `/parrainage` | Kyara | Code d'invitation, récompense au filleul et au parrain |
| Wiki | `/wiki`, `/wiki/[anilistId]` | Kyara | Fiches, silhouette si jamais obtenue |
| Classement | `/classement` | Kyara + toi | Collection, rang classé combat |
| Nouveautés | `/nouveautes` | Kyara | Personnages du dernier import |
| Avis et bugs | `/feedback` | Kyara | Formulaire simple |
| Notifications | cloche de l'en-tête | Kyara | Surenchère, vente conclue, défi, demande d'ami |

Mise en page :

- **Mobile (< 768 px)** : en-tête fixe (logo, jauge `x/10` avec compte à rebours, solde, cloche) et barre d'onglets en bas à 5 entrées : Boosters, Collection, Combat, Marché, Compte. Le reste se trouve dans la grille de tuiles du Compte, comme chez Kyara.
- **Tablette (768–1023 px)** : même structure, grilles de cartes en 4 colonnes.
- **Desktop (≥ 1024 px)** : la barre du bas devient une barre latérale gauche avec toutes les entrées ; contenu centré à 1 200 px max, grilles de 6 à 8 colonnes.
- Zones tactiles d'au moins 44 px, `env(safe-area-inset-bottom)` sous la barre d'onglets, actions principales à portée du pouce (bas de l'écran).
- Animations d'ouverture et de combat en CSS transform/opacity uniquement (fluides sur téléphone d'entrée de gamme), et coupées si `prefers-reduced-motion`.
- PWA : manifest et icône pour l'installer sur l'écran d'accueil, comme Kyara.

Comptes invités : Kyara crée un compte « Invité-3A046F » dès la première visite et propose ensuite de lier Discord pour ne pas perdre sa collection. Reproduis-le : un `User` avec `isGuest = true` créé par cookie, puis la connexion Discord rattache le compte OAuth à ce même utilisateur. Les invités ouvrent des boosters mais n'accèdent ni au marché, ni aux cadeaux, ni au combat classé (anti-multicomptes). Pseudo : 3 à 20 caractères, lettres, chiffres, `_` et `-` (`/^[A-Za-z0-9_-]{3,20}$/`).

Kyara affiche aussi un stock de 15 boosters et une monnaie nommée « Chakra » (300 au départ) : ce plan garde 10 boosters max, le même délai de 10 min, et appelle sa monnaie le Zeni (500 au départ).

### Vues clés (disposition inspirée de Kyara, visuel Kiraku)

**Accueil.** Sous l'en-tête, quatre sections empilées sur téléphone, en grille de 2 colonnes sur desktop :

1. **En direct · Gros tirages** : carrousel horizontal des dernières Légendaires et Mythiques tirées par les joueurs (grande illustration, pastille de rareté, avatar, pseudo et badges, « à l'instant »). Requête sur les `UserCard` récentes de rareté L ou M, rafraîchie toutes les 10 s.
2. **Marché · Ça se termine bientôt** : les 3 à 5 enchères les plus proches de la fin (vignette, nom, rareté en couleur, prix en Zeni, temps restant) et un lien « Tout le marché ».
3. **Classement · Top collectionneurs** : podium 2-1-3 avec avatar, nombre de cartes et de Mythiques, lien vers le classement complet. Ajoute un onglet « Top classé » pour ton mode classé.
4. **Avis · Ce qu'en disent les joueurs** : note moyenne (Kyara affiche 4,7 ★ sur 4 999 avis) et derniers avis avec avatar, étoiles, date et texte.

Tes tuiles s'ajoutent à la grille du Compte : Combat, Boutique, et Casino, avec l'étiquette « Bientôt » pendant le teaser puis « Nouveau » les jours qui suivent son ouverture (voir « Casino »).

**Récap d'ouverture** (`/ouvrir/[slug]`). Les cartes du booster en grille (3 + 2 chez Kyara, 3 × 3 pour tes 6 cartes), chacune avec un badge « Nouveau » si le joueur ne l'avait jamais eue. En dessous :

- le compteur de pitié du booster (« Vedette garantie dans 99 boosters » pour une bannière, « Mythique garantie dans … » pour le standard) ;
- un sélecteur ×1 / ×5 / ×10 pour ouvrir plusieurs boosters d'un coup ;
- le gros bouton « Ouvrir un autre », avec son coût affiché (gratuit tant qu'il reste du stock, sinon le prix en Zeni, 200 chez Kyara) ;
- « Changer de booster », « Voir la collection », « Copier le lien » (page publique `/tirage/[id]`, d'où le modèle `BoosterOpening`) et « Image » (image partageable générée avec `next/og`) ;
- un bouton son, mémorisé.

**Carte (fuda).** Un seul composant `<Fuda size="sm | md | lg" />`, réutilisé partout (récap, collection, marché, vitrines, combat), dessiné selon la direction artistique : cadre dans la matière de la rareté, sceau kanji, numéro, nom japonais vertical, nom latin, série, stats 力 et 気. L'effet de matière (laque, or, nacre) se fait en CSS (dégradés et `mix-blend-mode`) et suit l'inclinaison du téléphone (`deviceorientation`) ou la souris sur desktop ; il est coupé si `prefers-reduced-motion`. Un appui ouvre la fiche : grande carte, stats (les stats de combat dérivées arrivent avec le combat, étape 9), exemplaires possédés, recycler les doublons, mettre en vente, ajouter à une vitrine, fiche wiki.

**Pied de page.** Raretés, Règles, Nouveautés, Classement, Avis et bugs, choix de la langue, et la mention « Projet fan non officiel ».

## Système de boosters

Aucun cron ne distribue les boosters : le stock se recalcule à la volée à partir de deux colonnes, `boosterStock` et `boosterAnchor`. C'est gratuit en base, exact à la seconde, et ça tient avec un million de joueurs.

Règle de calcul :

- boosters gagnés = temps écoulé depuis `boosterAnchor` ÷ 10 min (arrondi vers le bas)
- si stock + gagnés ≥ 10 → stock = 10, et le chrono redémarre au moment où il en ouvre un
- sinon → stock += gagnés, et `boosterAnchor` avance de gagnés × 10 min (on garde les minutes déjà entamées)

```ts
// lib/boosters.ts
import { randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getCardPool } from "@/lib/card-pool";

export const MAX_BOOSTERS = 10;
export const INTERVAL_MS = 10 * 60_000;
export const CARDS_PER_BOOSTER = ;

export function computeStock(stock: number, anchor: Date, now = new Date()) {
  if (stock >= MAX_BOOSTERS) return { stock: MAX_BOOSTERS, anchor: now, nextAt: null };
  const gained = Math.floor((now.getTime() - anchor.getTime()) / INTERVAL_MS);
  if (stock + gained >= MAX_BOOSTERS) return { stock: MAX_BOOSTERS, anchor: now, nextAt: null };
  const newAnchor = new Date(anchor.getTime() + gained * INTERVAL_MS);
  return { stock: stock + gained, anchor: newAnchor, nextAt: new Date(newAnchor.getTime() + INTERVAL_MS) };
}

export async function openBooster(userId: string) {
  const pool = await getCardPool(); // catalogue en cache, groupé par rareté
  return prisma.$transaction(async (tx) => {
    // Verrouille la ligne : deux clics simultanés ne peuvent pas ouvrir le même booster
    const [u] = await tx.$queryRaw<{ boosterStock: number; boosterAnchor: Date }[]>`
      SELECT "boosterStock", "boosterAnchor" FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const { stock, anchor } = computeStock(u.boosterStock, u.boosterAnchor);
    if (stock < 1) throw new Error("NO_BOOSTER");

    const drawn = Array.from({ length: CARDS_PER_BOOSTER }, (_, i) =>
      pickCard(pool, floors[i]), // floors = floorsFor({ golden, divine })
    );

    await tx.user.update({
      where: { id: userId },
      data: { boosterStock: stock - 1, boosterAnchor: stock === MAX_BOOSTERS ? new Date() : anchor },
    });
    await tx.userCard.createMany({ data: drawn.map((c) => ({ ownerId: userId, cardId: c.id })) });
    return drawn;
  });
}

function pickCard(pool: CardPool, floor: Rarity) {
  const rarity = rollRarity(floor);
  const list = pool[rarity];
  return list[randomInt(0, list.length)];
}
```

Pitié : Kyara affiche « Pitié M 1/250 », soit une Mythique garantie au plus tard au 250e booster sans Mythique. Ajoute-la dans la même transaction :

```ts
const PITY_MYTHIC = 250;
const pity = u.pityCount + 1;
let drawn = Array.from({ length: CARDS_PER_BOOSTER }, (_, i) => pickCard(pool, floors[i]));
if (pity >= PITY_MYTHIC && !drawn.some((c) => c.rarity === "MYTHIC")) {
  drawn[CARDS_PER_BOOSTER - 1] = pickFrom(pool.MYTHIC); // force la dernière carte
}
const gotMythic = drawn.some((c) => c.rarity === "MYTHIC");
// dans le tx.user.update : pityCount: gotMythic ? 0 : pity
```

Ajoute `"pityCount"` au `SELECT … FOR UPDATE` et affiche le compteur sur la page Boosters et le Compte.

Côté client, la page reçoit `stock` et `nextAt` du serveur et affiche un compte à rebours local ; à zéro, elle rappelle le serveur. Le client ne décide jamais du stock.

L'animation d'ouverture (déchirer le paquet, retourner les 6 cartes une par une, flash selon la rareté) se joue après la réponse : le tirage est déjà enregistré, donc fermer l'onglet ne fait rien perdre.

## Raretés et taux de drop

Comme Kyara, la rareté vient de la popularité : le nombre de favoris du personnage sur AniList. On trie les personnages et leur percentile fixe le palier. Les taux, cadres et valeurs de recyclage ci-dessous sont ceux affichés par Kyara, et tous restent modifiables dans l'admin.

| Rareté | Sceau | Popularité (favoris AniList) | Part des cartes tirées | Cadre Kiraku | Recyclage d'un doublon |
| --- | --- | --- | --- | --- | --- |
| Mythique | 神 | Top 3 % | 0,025 % | Nacre irisée | 150 Zeni |
| Légendaire | 金 | Top 3–10 % | 0,15 % | Feuille d'or | 40 Zeni |
| Épique | 秀 | Top 10–25 % | 1,4 % | Laque violette | 10 Zeni |
| Rare | 稀 | Top 25–50 % | 11,4 % | Teinture indigo | 3 Zeni |
| Peu commune | 良 | Top 50–75 % | 25 % | Bambou | 1 Zeni |
| Commune | 並 | Le reste (25 %) | 62 % | Washi nu | 1 Zeni |

Sur \~6 700 personnages, ça fait environ 200 Mythiques, 470 Légendaires, 1 000 Épiques et 1 700 cartes dans chacun des trois paliers inférieurs. Le recyclage laisse toujours un exemplaire de chaque carte : le bouton n'agit que sur les doublons.

Deux stats sur chaque carte : **力 Puissance** et **気 Ki**, qui baissent avec le rang (environ 99 et 86 pour le n° 1, 43 et 30 vers le bas du catalogue). En combat, Puissance sert d'attaque et Ki de défense ; HP et vitesse en sont dérivés, avec des coefficients réglables dans l'admin.

Composition : Kyara met 5 cartes par booster, ce plan en garde 4.

| Carte | Kyara (5 cartes) | Ce plan (4 cartes) |
| --- | --- | --- |
| 1 | Commune ou mieux | Commune ou mieux |
| 2 | Commune ou mieux | Commune ou mieux |
| 3 | Commune ou mieux | Peu commune ou mieux |
| 4 | Peu commune ou mieux | Rare ou mieux, garantie |
| 5 | Rare ou mieux, garantie | — |

Bonus repris de Kyara :

- **Pitié** : au 250e booster sans Mythique, la dernière carte est forcément Mythique ; le compteur repart à zéro à chaque Mythique.
- **Booster doré** : chaque 10e booster standard contient une Épique ou mieux.
- **Booster divin** : 1 chance sur 2 000 d'avoir uniquement des Épiques ou mieux, dont une Mythique garantie. Remplacé à l'étape 13 par les sachets scellés Divin et Apocalyptique (voir « Sachets scellés »).

Avec ces taux, un booster contient une Mythique environ 1 fois sur 320 ; la pitié ramène l'écart moyen à \~175 boosters. Un joueur qui ouvre ses 144 boosters gratuits par jour en verra une environ tous les 1,2 jour, sans compter les boosters dorés et divins.

```ts
// Parts de Kyara en millièmes de % (entiers exacts, total 99 975)
const RATES: [Rarity, number][] = [
  ["MYTHIC", 25], ["LEGENDARY", 150], ["EPIC", 1_400],
  ["RARE", 11_400], ["UNCOMMON", 25_000], ["COMMON", 62_000],
];
const ORDER: Rarity[] = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"];
export const SLOT_FLOORS: Rarity[] = ["COMMON", "COMMON", "UNCOMMON", "RARE"];

// floor = rareté minimale de l'emplacement ; les paliers en dessous sont retirés du tirage
export function rollRarity(floor: Rarity = "COMMON"): Rarity {
  const table = RATES.filter(([r]) => ORDER.indexOf(r) >= ORDER.indexOf(floor));
  const total = table.reduce((s, [, w]) => s + w, 0);
  let x = randomInt(0, total);
  for (const [rarity, w] of table) if ((x -= w) < 0) return rarity;
  return table.at(-1)![0];
}

export function floorsFor(opts: { golden: boolean; divine: boolean }): Rarity[] {
  if (opts.divine) return SLOT_FLOORS.map((_, i) => (i === SLOT_FLOORS.length - 1 ? "MYTHIC" : "EPIC"));
  if (opts.golden) return [...SLOT_FLOORS.slice(0, -1), "EPIC"];
  return SLOT_FLOORS;
}
// divin : randomInt(0, 2000) === 0 ; doré : (standardCount + 1) % 10 === 0

export function rarityForRank(rank: number, total: number): Rarity {
  const p = rank / total;
  return p <= 0.03 ? "MYTHIC" : p <= 0.10 ? "LEGENDARY" : p <= 0.25 ? "EPIC"
       : p <= 0.50 ? "RARE" : p <= 0.75 ? "UNCOMMON" : "COMMON";
}

// Approximation des valeurs observées sur les cartes de Kyara
export function statsFor(rank: number, total: number) {
  const p = rank / total;
  return { power: Math.round(100 - 60 * p), ki: Math.round(30 + 56 * (1 - Math.sqrt(p))) };
}
```

Le catalogue (`Card` groupé par rareté) change rarement : charge-le une fois avec `unstable_cache` ou un cache module, invalidé quand tu ajoutes des cartes. Le recyclage des doublons en Zeni est ce qui alimente l'économie des enchères.

### Encens

Un Encens est gagné à chaque palier de `incense.cardStep` cartes tirées en boosters (1 000 par défaut, doublons compris, compté depuis `BoosterOpening.catalogCardIds` : rétroactif, ne baisse ni à la vente ni au recyclage). Disponibles = paliers atteints − `User.incenseUsed`. Activé depuis l'accueil ou son profil, il multiplie les parts à partir de `incense.boostFrom` (Légendaire : donc Légendaire, Mythique, AR, Gold) par `incense.rateBoost` (30 000 points de base = ×3, même calcul que l'Impérial, appliqué par-dessus les taux du type) pendant `incense.durationHours` (12 h) sur tous les boosters, crédités et sachets scellés compris. Un nouvel Encens prolonge le boost en cours sans cumuler la force. L'activation et le choix des taux se font sous le verrou du joueur (`User.incenseUntil`). Logique pure dans `lib/boosters/incense.ts`.

### Importer le catalogue

L'API GraphQL publique d'AniList (`https://graphql.anilist.co`, sans clé) trie les personnages par favoris et renvoie 50 personnages par page, avec leur œuvre la plus populaire dans la même requête. La limite normale est de 90 requêtes par minute, réduite pour l'instant à 30 : les \~136 pages des 6 736 personnages passent en 5 minutes environ. Une mise à jour par semaine suffit.

**Limite de profondeur.** AniList refuse toute page au-delà des 5 000 premières entrées d'une liste (HTTP 400 « Page depth exceeds maximum allowed », dès la page 101 à 50 par page), et l'API n'offre aucun filtre sur les favoris. L'import avance donc par **fenêtres de 5 000** : chaque nouvelle fenêtre repart de la page 1 en excluant (`id_not_in`) les personnages des fenêtres précédentes, ce qui remet la profondeur à zéro. La liste d'exclusion de 5 000 ids (\~31 Ko par requête) est acceptée.

L'import se fait en deux phases, avec le moteur dans `server/catalog/import.ts` (partagé par le script et, plus tard, l'admin) :

1. **Récupération, reprenable.** Chaque page est validée par Zod puis écrite dans une table de staging (`CatalogImportRow`), en une transaction qui avance aussi `CatalogImport.lastPage`. Après une interruption (Ctrl+C, coupure, 429 persistant), relancer la même commande reprend à `lastPage + 1`. La fenêtre et l'exclusion se déduisent du staging, donc la reprise est exacte même d'une fenêtre à l'autre. Une page de marge est récupérée au-delà de l'objectif, parce qu'un personnage peut changer de page pendant l'import.
2. **Finalisation, idempotente.** Le staging est trié par favoris, puis rang, rareté (percentile) et stats sont attribués. Une seule transaction écrit ensuite `Series` et `Card` en lots, avec `$executeRaw` balisé et `ON CONFLICT ("anilistId")` : les `id` restent stables d'un import à l'autre. Une carte qui sort du top N garde sa ligne, avec `rank = null`.

```bash
npm run catalog:import                                  # import complet (GameSetting catalog.size)
npm run catalog:import -- --limit 200 --dry-run         # essai sans écriture en base, rapport dans .import/
npm run catalog:import -- --fresh                       # repart de zéro au lieu de reprendre
npm run catalog:import -- --finalize-only               # reclasse le dernier staging sans appeler AniList
npm run catalog:import -- --finalize-only --rarity live # recalcule toutes les raretés pour cette fois
# PowerShell avale le « -- » : y écrire npm run catalog:import '--' --limit 200
```

Les rangs bougent entre deux imports : choisis dans l'admin si une carte peut changer de rareté (plus vivant) ou si sa rareté est figée à sa première apparition (plus juste pour ceux qui l'ont déjà). Le réglage `catalog.rarityPolicy` vaut `FROZEN` par défaut. Un essai sur 200 personnages fige des raretés calculées sur 200 cartes : avant le premier import complet, finalise avec `--rarity live`, ou importe directement sur une base vierge.

Images : utilise l'illustration AniList (`image.large`) dans le cadre de la fuda, et affiche en pied de page « Projet fan non officiel. Les personnages appartiennent à leurs ayants droit. »

## Types de boosters

34 boosters en 8 familles, tous définis dans l'admin comme une ligne `BoosterType` : un filtre sur le catalogue, des planchers de rareté par emplacement et un prix. Les boosters filtrés consomment le stock gratuit ; seuls les boosters de rareté se paient en Zeni. Les maquettes desktop et mobile sont sur [la planche Boosters](https://claude.ai/artifact/5F351xJiejSxJk3e52cF3a).

| Famille | Boosters | Filtre AniList | Prix |
| --- | --- | --- | --- |
| Standard | Tout anime | Aucun | Gratuit |
| Par rareté | Rare, Épique, Légendaire, Mythique | Aucun, planchers relevés | 300 / 1 200 / 5 000 Zeni ; Mythique en événement |
| Par démographie | Shōnen, Seinen, Shōjo, Josei | Tag démographique de l'œuvre (rang ≥ 60) | Gratuit |
| Par genre | Isekai, Sport, Mecha, Horreur, Romance, Fantasy, Science-fiction, Tranche de vie, Comédie, Psychologique, Musique | Genre de l'œuvre (Isekai : tag) | Gratuit |
| Par personnage | Waifus, Husbandos, Protagonistes, Seconds rôles, Anniversaires | `gender`, rôle MAIN/SUPPORTING, `dateOfBirth` = aujourd'hui | Gratuit |
| Par époque | Rétro (< 2000), Années 2000, Nouvelle vague (≥ 2018), Saison en cours | Année ou saison de l'œuvre | Gratuit |
| Spéciaux | Bannière vedette, Studio, Manga | Liste choisie, studio principal, œuvre de type MANGA | Gratuit |

Famille **Formats**, payée en Zeni : le **Pochibukuro** (100 Zeni, 2 cartes : Commune+ puis Peu commune+ ; Rare ou mieux 42,7 %, Épique+ 5,7 %, Mythique 0,09 %) pour dépenser de petites sommes, et le **Jūbako** (550 Zeni, 20 cartes = 5 sachets standard dont une carte Rare+ remplacée par une Épique+ ; Légendaire+ 19,2 %, Mythique 2,9 %). Ils comptent pour la pitié partagée.

Composition par type (C, U, R, E, L, M = plancher de l'emplacement, « + » = ou mieux) :

| Booster | Emplacements | Épique+ | Légendaire+ | Mythique |
| --- | --- | --- | --- | --- |
| Standard et filtrés | C · C · U+ · R+ | 18,4 % | 2,2 % | 0,31 % |
| Rare | R+ · R+ · R+ · R+ | 40,4 % | 5,3 % | 0,77 % |
| Épique | R+ · R+ · E+ · E+ | 100 % | 23,1 % | 3,5 % |
| Légendaire | E+ · E+ · E+ · L+ | 100 % | 100 % | 18,3 % |
| Mythique | E+ · E+ · E+ · M | 100 % | 100 % | 100 % |

Ces chances sont calculées à partir des parts de la section Raretés et s'affichent dans le panneau du booster sélectionné, comme chez Kyara.

Règles :

- **Rareté globale** : la rareté d'une carte reste celle de son rang dans tout le catalogue. Un booster Seinen ne fabrique donc pas de Mythiques : il tire dans ses cartes, et si un palier est vide dans son pool, l'emplacement descend au palier inférieur.
- **Pool minimum** : l'admin affiche la taille du pool de chaque booster et ses cartes par rareté ; un booster sous 100 cartes ne peut pas être activé. Anniversaires a un pool qui change chaque jour (quelques dizaines de persos), donc plancher abaissé à 20 cartes, et il disparaît les jours trop vides.
- **Pitié partagée** : un seul compteur Mythique (250) pour tous les boosters gratuits, et un booster doré tous les 10, quel que soit le booster ouvert. Les boosters de rareté n'ont ni doré ni divin.
- **Genre du personnage** : AniList laisse `gender` vide pour une partie des persos ; ils sont exclus de Waifus et Husbandos.
- **Mise en cache** : les ids de cartes de chaque pool sont recalculés après chaque import et gardés en cache, pour qu'un tirage reste une simple lecture.

```ts
// BoosterType.filter (Json) — évalué à l'import, jamais au tirage
type PoolFilter = {
  tags?: string[];          // ["Shounen"] — tag de l'œuvre, rang ≥ 60
  genres?: string[];        // ["Sports"]
  gender?: "Female" | "Male";
  role?: "MAIN" | "SUPPORTING";
  yearMin?: number; yearMax?: number;
  currentSeason?: boolean;
  birthdayToday?: boolean;
  studio?: string;
  mediaType?: "ANIME" | "MANGA";
  cardIds?: string[];       // bannière vedette
};
```

Pour l'import, la requête AniList récupère en plus, pour l'œuvre principale : `type`, `genres`, `tags { name rank }`, `startDate { year }`, `season`, `seasonYear`, `studios(isMain: true)`, le rôle du personnage dans l'œuvre, et sur le personnage `gender` et `dateOfBirth { month day }`. Ces champs vont dans `Card` (voir le schéma).

### Mise en œuvre (étape 4)

- **Chargement** : `npm run seed:boosters` crée les 34 types de départ (`prisma/seed/booster-types.ts`) sans écraser ceux déjà réglés dans l'admin (`--force` pour tout réécrire), puis recalcule les pools. L'import du catalogue recalcule aussi tous les pools à la fin.
- **Pools** : statiques en base (`poolCardIds`, `poolCounts`) et en cache ; les filtres du jour (anniversaires, saison en cours) sont recalculés une fois par jour dans le fuseau `game.timeZone`. Un type sous `booster.minPool` (ou son `minPoolSize`) est caché.
- **Prix** : un booster gratuit se paie `priceZeni` (200 par défaut) quand le stock ne couvre pas l'ouverture ; le joueur confirme le paiement avant le geste, le serveur débite sous verrou avec une ligne `CoinTransaction` (`BOOSTER`) par booster.
- **Bannière vedette** : son pool est son filtre plus les vedettes ; quand une rareté tirée a des vedettes, `featuredRate` (5 000 points de base = 50 %) des tirages vont à l'une d'elles ; la pitié vedette (100 par défaut, compteur par bannière dans `User.bannerPity`) force une vedette sur la dernière carte, ou l'avant-dernière si la pitié Mythique a pris la dernière.
- **Validation des taux** : trois sources qui doivent être d'accord. Le calcul exact (`lib/boosters/odds.ts`, paliers vides du pool repliés comme au tirage) est comparé au tableau ci-dessus par `odds.test.ts` ; une simulation Monte-Carlo de chaque composition (`simulation.test.ts`, `npm run sim:boosters -- --type all`) doit rester sous 5 σ et sous le χ² critique à p = 0,001 ; l'admin affiche les chances exactes de chaque type sur son pool réel.

## Sachets scellés : Divin et Apocalyptique

Deux boosters qu'on ne peut pas acheter. Ils **tombent** d'un booster ordinaire, très rarement, et le joueur l'apprend pendant l'ouverture : le sachet qu'il déchire se transforme, et le titre « BOOSTER DIVIN » ou « BOOSTER APOCALYPTIQUE » apparaît. Le sachet tombé se garde, s'ouvre quand on veut, ou s'offre à un ami. Ils remplacent le booster divin instantané de l'étape 3.

| | Kanji | Matière | Contenu |
| --- | --- | --- | --- |
| **Divin** | 天 (le ciel) | Nacre blanche et or, halo | E+ · E+ · E+ · M (comme l'ancien divin) : rien sous Épique, une Mythique, AR ou Gold garantie |
| **Apocalyptique** | 滅 (la destruction) | Laque noire, fissures shu | À l'ouverture, pile ou face décidé par le serveur : **épargné** → exactement un Divin ; **ruiné** → C · C · C · U, plafonné à Peu commune |

Sur le dernier emplacement d'un Divin, avec les parts actuelles (Mythique 15, AR 8, Gold 2) : environ 60 % Mythique, 32 % AR, 8 % Gold. Les trois autres sortent Épique à environ 90 %.

Pourquoi 天 et pas 神 : 神 est déjà le sceau de la rareté Mythique, et un booster ne doit pas se confondre avec une rareté. Les deux kanji entrent dans le sous-ensemble de Yuji Syuku.

### Obtention

- **Tirage** : à chaque ouverture d'un type `bonusEligible`, hors crédit et hors sachet scellé, le serveur tire d'abord Divin (1 chance sur `booster.divineOdds`, 4 000 par défaut), sinon Apocalyptique (1 sur `booster.apocalypseOdds`, 2 000). Les deux s'excluent.
- **Le booster est remplacé** : il ne donne pas de cartes et n'avance ni la pitié Mythique, ni le compteur du doré, ni la pitié vedette. Il consomme quand même son stock ou son prix, puisque c'est lui qui s'est transformé. Un 10e booster doré ne peut pas se transformer : le doré passe d'abord.
- **Ailleurs** : lots de l'admin (`/admin/lots`, objet de type `DROP`) et, plus tard, récompenses (fin de saison classée, palier de parrainage). **Jamais en vente** contre des Zeni : un Divin vaut plus qu'un booster Légendaire à 5 000 Zeni et rendrait les boosters de rareté inutiles, et un Apocalyptique payant serait un pari en Zeni.

Équilibre : avec 1 sur 4 000 et 1 sur 2 000, un booster qui peut se transformer donne en moyenne 2,14 contenus « divins » pour 4 000 (1 Divin + 2 Apocalyptiques épargnés à 57 % avec le karma ci-dessous). Comme un booster doré (1 sur 10) ne se transforme jamais, un joueur en voit en pratique environ 1,93 tous les 4 000 boosters (simulation de 4 millions de boosters), contre 2 avec l'ancien divin. La masse de Mythiques en circulation ne bouge presque pas. Un joueur qui ouvre 144 boosters par jour voit un sachet scellé environ une fois par semaine ; la pitié lui donne déjà une Mythique tous les 1,2 jour.

### Ouverture

- **Pitié intacte** : ouvrir un sachet scellé n'avance pas et ne remet pas à zéro la pitié Mythique (`countsForPity: false`). Un Divin ne doit jamais « manger » une pitié presque pleine.
- **Apocalyptique** : épargné avec la probabilité `booster.apocalypseWinRate` (5 000 points de base = 50 %), tiré au moment de l'ouverture, jamais à la chute : un sachet offert reste un vrai mystère, même dans les données envoyées au client.
- **Karma de l'Apocalypse** : chaque Apocalyptique ruiné ajoute une charge à `User.apocalypseKarma` ; à `booster.apocalypseKarma` charges (2 par défaut), le suivant est forcément épargné et le compteur repart à zéro. Le karma appartient à celui qui ouvre. Le sachet affiche les charges (« 滅 2/2 · le prochain est épargné »). Taux d'épargne effectif : 1 / 1,75 ≈ 57 %.
- **Survivant de l'Apocalypse** : titre débloqué au premier Apocalyptique ruiné (condition `APOCALYPSE_RUINED`, n réglable dans l'admin). Un échec qu'on a envie de montrer.
- **Pas d'annonce spéciale** dans le carrousel « En direct » : les cartes d'un sachet scellé y entrent selon la règle habituelle (Épique ou mieux), sans bandeau particulier.

### Cadeau empoisonné

- Un sachet tombé d'un tirage peut s'offrir **une fois**. Un sachet reçu (ami, lot, récompense) ne se ré-offre pas.
- Quand le destinataire ouvre un Apocalyptique offert, l'expéditeur reçoit une notification `DROP_OPENED` avec l'issue : « Ton Apocalyptique a explosé au visage de Léa » ou « … a épargné Léa : Gold ! » (payload : ids et rareté, jamais de texte libre). Même chose pour un Divin offert (« Léa a ouvert ton Divin : AR »).
- **Garde-fous contre le farm de comptes** (les invités sont créés automatiquement) : expéditeur lié à Discord (`gifts.sealedRequiresDiscord`), compte de plus de `gifts.sealedMinAccountDays` jours (7), amitié de plus de `gifts.minFriendshipHours`, au plus `gifts.sealedPerWindow` sachets offerts sur les `gifts.sealedWindowDays` derniers jours (2 tous les 3 jours, fenêtre glissante, réglable dans `/admin/social`), et le cadeau compte dans les quotas du jour existants. Le stock gratuit, lui, ne se transfère toujours pas.

### Écran

- **Transformation** (environ 1,2 s, dans `OpeningStage`) : le sachet tremble, puis Divin blanchit sous un halo qui tourne, ou Apocalyptique noircit et se fend. Le titre s'affiche, puis trois actions : **Ouvrir maintenant**, **Garder**, **Offrir** (grisé avec la raison si un garde-fou bloque). Dans une ouverture de 10, la transformation interrompt la série pour avoir son moment, puis la série reprend ; le récap montre le sachet scellé à sa place avec les mêmes actions.
- **Ouverture d'un Apocalyptique** : le sceau 滅 se fend en deux. Épargné : de l'or (kin) passe par les fissures et le sachet devient nacre, puis révélation normale. Ruiné : le sachet s'effrite et une douzaine de cendres tombent, puis les cartes arrivent, grises.
- **Accueil** : une rangée « Sachets scellés » à côté des crédits, avec le karma sur les Apocalyptiques.
- **Fluidité** : uniquement `transform` et `opacity`. Le halo est un dégradé conique pré-dessiné qui tourne ; les fissures sont des calques SVG révélés par opacité, pas par `stroke-dashoffset` ; les cendres reprennent le principe de `GoldenDust`. Mode allégé avec moins de particules, simple fondu sous `prefers-reduced-motion`, et effets chargés par import dynamique.

### Données et code

- **`SealedDrop`** : un sachet = une ligne (`id`, `ownerId`, `boosterTypeId`, `source` DRAW · GIFT · LOT · REWARD, `giverId?`, `giftable`, `openingId?`, `createdAt`, `openedAt?`). Un compteur `BoosterCredit` ne suffit pas : il faut savoir pour chaque sachet s'il peut s'offrir et à qui envoyer le résultat. Ouverture et cadeau passent par un `updateMany` conditionnel (`openedAt IS NULL AND ownerId = …`) dans la transaction : deux clics ne peuvent pas ouvrir ni offrir deux fois le même sachet.
- **`BoosterType`** : deux lignes `divin` et `apocalypse`, `kind = DROP` (nouvelle valeur), `priceZeni = null`, `usesFreeStock = false`, `countsForPity = false`, `bonusEligible = false`, cachées de la page de choix. Leur thème reste réglable dans l'admin. Planchers de l'Apocalyptique ruiné : `booster.apocalypseRuinFloors` (C · C · C · U) et plafond `booster.apocalypseRuinCeiling` (UNCOMMON).
- **`lib/boosters/draw.ts`** : `DrawnBooster.divine` devient `drop: "divin" | "apocalypse" | null` ; `rollRarity` accepte un plafond ; une fonction pure `drawSealed(rng, kind, state)` rend les cartes, l'issue et le nouveau karma. `BoosterOpening` garde `divine` pour l'historique et ajoute `sealedDropId?` et `apocalypse` (`SPARED` · `RUINED` · null).
- **`Gift`** : nouvelle valeur `GiftKind.DROP` et colonne `sealedDropId?`.
- **Admin** : les nouveaux réglages dans le formulaire des boosters, des transformations forcées dans `/admin/test-ouverture`, et le don de sachets scellés dans la fiche joueur et les lots.
- **Ancien réglage** : `booster.divineOdds` change de sens (chute d'un sachet au lieu d'un divin instantané) et passe de 2 000 à 4 000. La migration réécrit la valeur en base si elle vaut encore 2 000.
- **Tests (Vitest)** : exclusion Divin/Apocalyptique et taux de chute ; booster remplacé sans effet sur les compteurs ; plafond de rareté ; issue de l'Apocalyptique et karma ; règles de cadeau. Test base : deux ouvertures simultanées du même sachet, une seule réussit ; cadeau et ouverture simultanés. `npm run sim:boosters` simule les chutes et vérifie l'équilibre annoncé ci-dessus.

## Profil, amis et vitrine

Une seule page publique `/u/[username]` sert à la fois de « Mon compte » et de profil d'ami : en-tête (avatar, pseudo, rang classé, % du catalogue complété), vitrine principale (la seule que voient les autres joueurs) puis, pour son propriétaire seulement, l'accès rapide à ses autres vitrines, privées, avec « Afficher » pour changer de principale ; puis collection. Chaque vitrine a sa page `/u/[username]/vitrines/[id]` (onglets et mode édition pour son propriétaire ; seule la principale est accessible aux autres, avec son bouton de partage). Les boutons d'édition n'apparaissent que si c'est ton propre profil.

| Écran | Route | Données |
| --- | --- | --- |
| Profil | `/u/[username]` | user + `Showcase` (la première avec ses `ShowcaseItem`) + stats |
| Collection | `/u/[username]/collection` | `UserCard` groupées par `cardId` avec compteur de doublons |
| Amis | `/friends` | demandes reçues, envoyées, amis acceptés |
| Album | `/collection/album` | tout le catalogue, cartes non possédées en silhouette |

Trois écrans repris de Kyara complètent le tableau : le wiki `/wiki/[anilistId]` (fiche visible en silhouette tant que `Discovery` n'existe pas pour ce joueur, avec rareté, série et chance d'obtention), le classement `/classement` (cartes uniques possédées, rang classé) et `/nouveautes` (personnages ajoutés au dernier import). Kyara autorise aussi les cadeaux entre amis : réutilise le transfert de propriété des enchères, limité aux amis acceptés et à quelques cadeaux par jour pour bloquer le farm.

Amis : une demande crée une `Friendship` en `PENDING` ; l'accepter la passe en `ACCEPTED`. Avant de créer, vérifie qu'aucune ligne n'existe dans l'autre sens (A→B ou B→A). La liste d'amis = les lignes `ACCEPTED` où tu es d'un côté ou de l'autre.

Vitrines (`Showcase`, `ShowcaseItem`) : un joueur en a jusqu'à `showcase.maxPerPlayer` (6) ; la première est la vitrine principale, la seule affichée sur le profil et visible par les autres joueurs, les autres sont privées. Chacune a un nom facultatif (32 caractères, texte brut), une disposition (`lib/showcase/layouts.ts` : 16 gabarits, grilles à zones nommées, Éventail, Frise de 20 cartes) et un thème (`lib/showcase/theme-registry.ts` : Sans décor, puis sept fonds vidéo en boucle avec leur image fixe, dans `public/vitrines/<thème>/` et refaits par `npm run vitrines:assets` : Paravent d'or, Alcôve, Coffret laqué et Mur des vœux, dont les cartes sont habillées par `theme-mounts.css` (passe-partout de la vedette, rouleaux et tablettes, compartiments laqués, ema suspendus) ; Black edition, Éclat et Gold, chacun lié à sa rareté : 1 BR, 1 VR, 1 Gold par défaut). Le client envoie des ids de `Card` ; le serveur choisit l'exemplaire (celui déjà exposé dans une vitrine, sinon le plus ancien en `COLLECTION`) sous le verrou de la ligne `User`, le même que le recyclage. Un même exemplaire peut être dans plusieurs vitrines, une fois par vitrine ; quand il change de main (cadeau, vente, échange), il quitte toutes les vitrines dans la même transaction. Thèmes : statut (disponible, « Arrive prochainement » flouté avec un cadenas, masqué) et condition de déblocage (celles des cosmétiques, ex. 1 carte BR pour Black edition) dans le réglage `showcase.themes` ; la condition est vérifiée au choix du thème, puis acquise ; un thème qui n'est plus disponible s'affiche en Sans décor. Avec un fond vidéo, la scène garde le format de l'image (3:4, puis 16:9), sur le profil comme sur la page de la vitrine : une grille trop haute rétrécit pour y tenir, jusqu'à 55 % de sa largeur (`gridFit` dans `lib/showcase/layouts.ts`, plus la hauteur des habillages), si bien que le fond n'est jamais rogné ; au-delà, la scène grandit. La scène est ouverte, sans cadre : le fond se fond dans la page sur ses bords (fondu plus court pour les décors dessinés, qui gardent corde, poutre et bordure) et va d'un bord de l'écran à l'autre sur téléphone. Sur le profil, le nom de la vitrine principale passe sous ses cartes, comme le cartel d'une œuvre, avec le sceau du décor ; ce décor habille aussi le haut du profil en bannière (image fixe, voilée de la couleur de la page selon la clarté du décor, plus fort en Washi, et fondue vers le bas) ; sur l'étagère du propriétaire, chaque vitrine montre son décor. Effets autour des cartes en vitrine selon la rareté : BR fil rouge, AR miroir (liseré irisé fin, éclats qui s'allument sur toute la hauteur), Mythique poussière de lumière, Gold reflet qui fait le tour du cadre et paillettes, MR trame, VR vitrail, Esprit brume (voile froid qui respire derrière la carte, feux follets qui montent), XR prisme (filet argent détaché de la carte, lueur irisée qui en fait le tour, deux petites étoiles). La carte porte déjà le cadre de sa rareté : un effet reste fin et collé à elle (liseré d'un pixel et demi au plus, rien qui déborde sur les cartes voisines).

Collection performante : un `GROUP BY cardId` en SQL (`$queryRaw` balisé, jointure `Card` et `Series`, tri tiré d'une liste fermée de fragments), paginé par 48 cartes. Ne charge jamais toutes les instances d'un coup : un joueur actif en accumule plusieurs milliers en quelques semaines.

### Mise en œuvre (étape 5)

- **Collection** (`/collection`) : filtres dans l'URL (recherche, raretés, série, doublons, 7 tris), liste virtualisée par lignes (TanStack Virtual), pages suivantes chargées par `loadCollectionPage` à l'approche du bas. Pagination par décalage : un joueur a au plus autant de lignes que de cartes au catalogue (~6 700), un `OFFSET` reste bon marché.
- **Fiche carte** : `/collection/[anilistId]`, ouverte en feuille au-dessus de la liste par une route interceptée (`@sheet/(.)[anilistId]`) pour garder la liste montée et sa position.
- **Recyclage** : par carte (fiche) ou « tout recycler jusqu'à la rareté X » avec récap ; le serveur refuse (`STALE`) si le gain n'est plus celui affiché. Transaction : verrou `User`, suppression conditionnelle sur `status = COLLECTION`, crédit et ligne `CoinTransaction` `DISSOLVE`. Valeurs par rareté dans `collection.recycleValues` (`/admin/collection`). Les exemplaires recyclés sont supprimés ; `BoosterOpening.catalogCardIds` garde les ids de `Card` pour que `/tirage/[id]` reste lisible.
- **Vitrines** : création (nom, disposition, thème, remplissage avec les meilleures cartes), mode édition, glisser-déposer au doigt (Motion `drag` + `layoutId`), carte sélectionnée (Changer, Vedette, ← →, Retirer) pour le clavier, ajout de plusieurs cartes d'un coup, depuis la fiche carte « Ajouter à une vitrine ».
- **Confidentialité** : `User.profileVisibility` (`PUBLIC`, `FRIENDS`, `PRIVATE` ; `FRIENDS` = amis acceptés depuis l'étape 6) et `showCollection`. Un invité naît `PRIVATE` et passe `PUBLIC` à l'inscription, sauf s'il a déjà choisi (`privacyChosenAt`). Un profil privé répond comme un public (200), avec le pseudo seul ; un invité ou un profil non public n'est pas indexé.

### Mise en œuvre (étape 6)

- **Amis** (`/amis`, onglets Amis · Demandes · Bloqués) : `Friendship` porte une `pairKey` unique (ids triés), une seule ligne par paire quel que soit le sens, garantie par la base. Les deux `User` sont verrouillés dans l'ordre des ids (`server/social/lock.ts`) : deux demandes croisées donnent une amitié acceptée. Envoyer une demande à quelqu'un qui t'a déjà demandé l'accepte. Décisions pures dans `lib/social/relation.ts`.
- **Refus silencieux** : refuser pose `declinedAt` ; l'expéditeur voit toujours « Demande envoyée », ne peut pas relancer et n'est pas prévenu. Annuler une demande ou retirer un ami pose un délai (`FriendRequestCooldown`, `friends.requestCooldownHours`).
- **Blocage** (`UserBlock`) : supprime l'amitié, les demandes et les notifications du bloqué ; son profil voit le bloqueur comme un profil privé ; ses demandes suivantes sont enregistrées déjà refusées.
- **Anti-énumération** : la recherche de joueurs de `/social` (`server/social/search.ts`, règles dans `lib/social/search.ts`) n'est partielle (dès 3 caractères) que sur les profils visibles par le lecteur — publics, ou « amis » pour un ami — et exacte (casse ignorée) sur les autres, montrés avec le pseudo seul ; jamais d'invité, de banni ni de compte gelé, un joueur qui t'a bloqué répond comme un profil privé, `social.searchLimit` résultats au plus, rate limit `social.searchPerMinute` par joueur et `social.searchPerMinuteIp` par IP. L'ajout depuis `/amis` reste par pseudo exact. Une demande vers un joueur qui t'a bloqué, invité, banni, plein ou en délai répond « envoyée » comme une vraie ; seuls « introuvable » et « déjà en cours » diffèrent. Rate limit par joueur (10/h, 30/jour) et par IP (30/h). Invités exclus du social.
- **Cadeaux** (`Gift`, envoi direct) : comptes inscrits, compte ≥ `gifts.minAccountAgeHours` (48 h), amitié ≥ `gifts.minFriendshipHours` (24 h), `gifts.perDaySent` (3) et `gifts.perDayReceived` (5) par jour du fuseau du jeu, comptés sous verrou. Carte : le serveur choisit l'exemplaire (le plus récent hors vitrine), transfert par `updateMany` conditionnel sur `status = COLLECTION`, exemplaire retiré de toutes les vitrines, `Discovery` du destinataire. Booster : payé `gifts.boosterPriceZeni` Zeni par l'expéditeur (ligne `CoinTransaction` `GIFT`), crédité dans `User.giftBoosters` ; il s'ouvre depuis l'accueil (`/ouvrir/standard?offert=1`), un à la fois, sans doré ni divin, pitié Mythique comprise. Le stock gratuit ne se transfère jamais.
- **Notifications** (`Notification`, types `FRIEND_REQUEST`, `FRIEND_ACCEPTED`, `GIFT_RECEIVED`) : créées dans la transaction de l'événement, payload d'ids seulement, texte rendu à la lecture. Cloche dans l'en-tête (compteur serveur, sondage 60 s onglet visible), page `/notifications` par curseur, purge paresseuse des lues après `notifications.retentionDays`.
- **Web Push** (onglet fermé) : opt-in depuis `/compte` (permission demandée au clic seulement, invités exclus), un `PushSubscription` par navigateur (endpoint unique, limité aux services push des navigateurs). Envoi après la validation de la transaction qui crée la notification, via `after()`, texte rendu dans `User.locale` ; abonnements en 404/410 supprimés. Clés `VAPID_*` côté serveur (la publique est passée par la page), interrupteur `notifications.pushEnabled`. Service worker `public/sw.js` et manifest (`app/manifest.ts`) posés en avance sur l'étape 10 ; sur iPhone, le push exige Kiraku installé sur l'écran d'accueil.
- **Admin** : `/admin/social` (interrupteurs, limites, raretés offrables, journal des derniers cadeaux).
- **Tests** : `lib/social/*.test.ts` ; `server/social/social.db.test.ts` (demandes croisées, quotas sous concurrence, double cadeau d'un exemplaire, solde = journal), sauté sans `DATABASE_URL_TEST`.

### Étape 12 : échanges, chat et profil personnalisable

**Échanges entre amis** (`Trade`, `TradeOffer`, `server/social/trade-core.ts`). Depuis le profil d'un ami : « je veux ta carte X contre l'une de celles-ci ». Rien n'est bloqué pendant l'attente ; à l'acceptation, la proposition puis les deux joueurs sont verrouillés, l'amitié, les blocages et un exemplaire libre de chaque côté sont relus, puis les deux exemplaires changent de propriétaire par des `updateMany` conditionnels (sinon la proposition passe en `FAILED`). L'ami choisit la carte qu'il reçoit ; chacun voit la révélation comme au sortir d'un booster. Réglages `trades.*` (durée, cartes offertes, quotas, raretés) dans `/admin/social`.

**Échanges ouverts du Marché** (`TradeListing`, `TradeListingWant`, `ListingOffer`, `server/market/listing-core.ts`). Onglets « Échanges » et « Mes échanges » de `/marche`, sans amitié requise : une carte de sa collection contre 1 à `listings.maxWants` cartes qu'on n'a pas. Les autres joueurs voient en or les cartes demandées qu'ils peuvent donner (« Donner X ») ou proposent une autre carte (« Proposer autre chose », `listings.allowOther`). L'auteur reçoit `LISTING_OFFER` avec les deux visuels et accepte ou refuse depuis la notification ; l'offrant reçoit `LISTING_ACCEPTED` ou `LISTING_DECLINED`. Rien n'est bloqué pendant l'attente : à l'acceptation, l'annonce, l'offre puis les joueurs sont verrouillés et les exemplaires changent de main par `updateMany` conditionnels ; la première offre acceptée ferme les autres. Réglages `listings.*` dans `/admin/marche`, âge minimal du compte partagé avec l'hôtel des ventes.

**Chat entre amis** (`ChatMessage`). Amis acceptés seulement, texte brut nettoyé, blocage respecté. Messages éphémères : ils disparaissent `chat.retentionHours` après leur envoi (24 h par défaut), filtrés dès la lecture puis supprimés par un ménage paresseux ; un rappel s'affiche en tête de chaque discussion. Temps réel par Ably sur le canal privé du joueur, sinon sondage tant que l'onglet est visible. Desktop : bulle en bas à droite ; mobile : icône 話 dans l'en-tête.

**Profil personnalisable** (`Cosmetic`, `lib/profile/conditions.ts`). Bio, accord des titres (masculin / féminin), titre et cadre d'avatar choisis parmi ceux débloqués, badges dérivés (Pionnier, Ambassadeur, Compte vérifié) dans l'ordre choisi. Titres et cadres sont gérés dans `/admin/cosmetiques` avec une condition : toujours, cartes uniques, cartes d'une rareté, série complétée (ex. « Devil Hunter » pour Chainsaw Man), nombre de séries complétées, boosters ouverts, échanges réussis, rang classé. Le serveur revérifie chaque choix à l'enregistrement. Cadres dans les matières de la DA (washi, bambou, aizome, urushi, kinpaku, raden, sakura, kintsugi), jamais le cadre arc-en-ciel de Kyara. Premiers titres et cadres : `npm run seed:cosmetics`.

**Couleur du pseudo et décor partout** (`Cosmetic` de type `NAME_COLOR`, `lib/profile/name-colors.ts`). Deux conditions de plus : % du catalogue publié découvert (table `Discovery`, arrondi à l'inférieur) et nombre de cartes découvertes de raretés choisies. Couleurs de départ : vert 20 %, bleu 35 %, violet 50 %, orange 70 %, rouge 90 %, arc-en-ciel 100 %, et arc-en-ciel pastel pour 20 Mythiques, AR ou Gold découvertes ; cadres du catalogue découvert : kumo 10 %, seigaiha 25 %, momiji 50 %, tsuki 75 %, hōō 100 %. Un cosmétique déjà porté le reste si le catalogue grandit ; seul un nouveau choix est revérifié. Cadre et couleur s'affichent partout où un joueur apparaît (`PlayerAvatar`, `PlayerName`, `server/profile/decor.ts`), sauf pour un pseudo masqué (« Un joueur »). Orange et arc-en-ciel ne servent qu'au pseudo, jamais à un cadre.

## Hôtel des ventes

Les joueurs paient en Zeni, la monnaie virtuelle du jeu, jamais en argent réel. Une vente bloque la carte (`status = AUCTION`) et chaque enchère bloque les Zeni de l'enchérisseur : impossible de vendre deux fois la même carte ou de miser de l'argent qu'on n'a pas.

Règles :

- Le vendeur fixe un prix de départ, un « achat immédiat » optionnel et une durée (1 h, 6 h, 24 h ou 48 h).
- Enchère minimale = enchère actuelle + 5 % (au moins 1 pièce).
- L'enchère précédente est remboursée immédiatement quand quelqu'un surenchérit.
- Anti-sniping : une mise dans les 2 dernières minutes prolonge la vente de 2 minutes.
- Taxe de 5 % prélevée sur la vente : elle retire des Zeni du jeu et limite l'inflation.
- Max 10 ventes actives par joueur ; comptes de moins de 48 h exclus (anti-multicomptes).

```ts
// app/market/actions.ts
"use server";
export async function placeBid(auctionId: string, amount: number) {
  const userId = await requireUserId();
  await ratelimit(userId, "bid");
  return prisma.$transaction(async (tx) => {
    const [a] = await tx.$queryRaw<Auction[]>`
      SELECT * FROM "Auction" WHERE id = ${auctionId} FOR UPDATE`;
    if (!a || a.status !== "ACTIVE" || a.endsAt <= new Date()) throw new Error("CLOSED");
    if (a.sellerId === userId) throw new Error("OWN_AUCTION");
    const min = a.currentBid ? Math.max(a.currentBid + 1, Math.ceil(a.currentBid * 1.05)) : a.startPrice;
    if (amount < min) throw new Error("TOO_LOW");

    // Débit atomique : échoue si le solde est insuffisant
    const debited = await tx.user.updateMany({
      where: { id: userId, coins: { gte: amount } },
      data: { coins: { decrement: amount } },
    });
    if (debited.count === 0) throw new Error("NOT_ENOUGH_COINS");
    await tx.coinTransaction.create({ data: { userId, amount: -amount, reason: "BID_HOLD", refId: a.id } });

    if (a.currentBidderId) {
      await tx.user.update({ where: { id: a.currentBidderId }, data: { coins: { increment: a.currentBid! } } });
      await tx.coinTransaction.create({ data: { userId: a.currentBidderId, amount: a.currentBid!, reason: "BID_REFUND", refId: a.id } });
    }

    const twoMin = 2 * 60_000;
    const endsAt = a.endsAt.getTime() - Date.now() < twoMin ? new Date(Date.now() + twoMin) : a.endsAt;
    await tx.bid.create({ data: { auctionId, bidderId: userId, amount } });
    return tx.auction.update({ where: { id: auctionId }, data: { currentBid: amount, currentBidderId: userId, endsAt } });
  });
}
```

Clôture : une fonction `settleAuction(id)` fait passer la vente de `ACTIVE` à `SOLD` ou `EXPIRED` avec un `updateMany({ where: { id, status: "ACTIVE" } })` ; si `count` vaut 0, quelqu'un l'a déjà clôturée et on s'arrête. Ensuite : la carte change de propriétaire (ou revient au vendeur), le vendeur reçoit le prix moins 5 %, l'exemplaire quitte les vitrines où il était exposé.

Elle est appelée à deux endroits : quand quelqu'un affiche une vente terminée, et par une tâche planifiée qui balaie `status = ACTIVE AND endsAt < now()` (Vercel Cron). L'index `[status, endsAt]` rend ce balayage instantané.

Pour la page du marché : liste paginée par curseur, filtres rareté/série/prix, tri « finit bientôt » par défaut. Rafraîchis le prix d'une vente ouverte toutes les 5 s (SWR) ; pas besoin de WebSocket au départ.

### Mise en œuvre (étape 8)

- **Modèles** (`Auction`, `Bid`, migration `etape_8_marche`) : `price` dénormalisé (= `currentBid ?? startPrice`) pour trier et filtrer, `feeBp` figé à la mise en vente, `userCardId` en `SET NULL` (l'acheteur peut recycler sa carte), `cardId` gardé pour l'historique. En SQL : index unique partiel « une seule vente `ACTIVE` par exemplaire », `CHECK` sur les prix et sur « mise ⇔ meneur ».
- **Séquestre et invariant** : la mise en tête est déjà débitée du meneur (`BID_HOLD`) et rendue dès qu'il est dépassé (`BID_REFUND`), dans la même transaction. À la clôture, le vendeur reçoit `SALE + prix` et `FEE − taxe` en un seul `applyEntries`. **Σ soldes + Σ `currentBid` des ventes ACTIVE + Σ taxes ne bouge jamais** ; chaque solde reste égal à son journal.
- **Ordre des verrous** : toujours la vente (`FOR UPDATE` ou `updateMany` conditionnel), puis les joueurs triés par id (`lockPlayers`), tous d'un coup (enchérisseur, ancien meneur, vendeur si achat immédiat). Deux mises croisées attendent au lieu de s'interbloquer.
- **Cœur** (`server/market/auction-core.ts`, client injecté) : `createAuctionWith` (le serveur choisit l'exemplaire, hors vitrine de préférence), `placeBidWith` (surenchère `minNextBid`, anti-sniping `extendedEndsAt`, une mise qui atteint l'achat immédiat conclut la vente à ce prix), `buyNowWith` (`STALE` si le prix vu a changé), `cancelAuctionWith` (vendeur, seulement sans mise), `adminCancelAuctionWith` (rembourse, `AdminLog`), `settleAuctionWith` idempotent (`updateMany` sur `status = ACTIVE, endsAt ≤ now, currentBid` lu), `settleDueWith` (balayage). Règles pures et testées dans `lib/market/rules.ts`, filtres et curseur dans `lib/market/filters.ts`.
- **Accès** : invités en consultation seule ; comptes de moins de `market.minAccountAgeHours` exclus ; `market.maxActivePerSeller` compté sous le verrou du vendeur. Tous les réglages `market.*` sont dans `/admin/marche`.
- **Clôture (gratuite, plan Hobby)** : le sondage de la cloche (toutes les `notifications.pollSeconds`, onglet visible) clôt les ventes terminées du joueur, vendeur ou meneur, avant de lire ses notifications : gagnant prévenu et vendeur payé en moins d'une minute tant qu'ils ont le jeu ouvert. La fiche d'une vente terminée, « Mes ventes » et « Mes enchères » clôturent aussi ce qu'elles affichent. Filet de sécurité : Vercel Cron une fois par jour à 4 h UTC (`vercel.json` → `/api/cron/market`, balayage par lots de 100 pendant 45 s au plus, `Authorization: Bearer $CRON_SECRET` comparé en temps constant ; `CRON_SECRET` obligatoire en production, vérifié par `check-deploy-env`). Passer en Pro permettrait `* * * * *` sans autre changement.
- **Écrans** : `/marche` (onglets Toutes · Mes ventes · Mes enchères, filtres en formulaire GET repliable, curseur), `/marche/[id]` (prix sondé toutes les `market.pollSeconds`, mise en deux temps avec `useOptimistic`, achat immédiat, retrait), « Mettre en vente » dans la fiche carte de la collection. Notifications `OUTBID`, `AUCTION_WON`, `AUCTION_SOLD`, `AUCTION_EXPIRED`, `AUCTION_CANCELLED`. `/admin/economie` affiche les Zeni en séquestre.
- **Tests** : `lib/market/*.test.ts` ; `server/market/market.db.test.ts` (50 enchères simultanées sur une vente, 12 clôtures simultanées, un enchérisseur sur 50 ventes, mises croisées, annulation contre mises, double mise en vente, achat immédiat contre mises, anti-sniping, expiration, annulation admin, bilan global), sauté sans `DATABASE_URL_TEST`.

### Avis de recherche

Un joueur publie un avis « je veux cette carte à ce prix » : le prix est **bloqué** sur son solde (`ORDER_HOLD`) pendant `market.orderDurationDays` jours (7). Le premier détenteur d'un exemplaire libre peut la lui vendre **en un clic** (fiche carte, onglet « Avis de recherche » du marché) : la carte change de main, le vendeur reçoit `SALE` + prix puis `FEE` − taxe (taux figé à la publication). Retrait à tout moment ou expiration : les Zeni reviennent (`ORDER_REFUND`).

- Même verrou que les enchères : l'avis (`FOR UPDATE`) puis les joueurs triés par id ; transfert de l'exemplaire par `updateMany` conditionnel. Invariant : Σ soldes + Σ séquestres (enchères ACTIVE et avis OPEN) + Σ taxes ne bouge pas (`server/market/buy-orders.db.test.ts`).
- Bornes de prix des mises en vente (prix de départ minimal, plafond de la rareté), au plus `market.maxOpenOrders` avis ouverts (10), comptes récents et invités exclus.
- Les détenteurs sont prévenus (`BUY_ORDER_WANTED`) si l'offre dépasse la cote ou qu'il n'y en a pas, au plus une fois par jour et par carte.
- Un avis échu est masqué et invendable aussitôt ; ses Zeni reviennent au passage du cron du marché, ou dès que l'acheteur ouvre ses avis.
- Les ventes sur avis comptent dans la cote.

### Cote des cartes

La cote d'une carte est le **prix médian** de ses ventes terminées, enchères (`Auction` en `SOLD`) et avis de recherche remplis (`BuyOrder` en `FILLED`), sur les `market.quoteWindowDays` derniers jours (30 par défaut). Elle n'existe qu'à partir de `market.quoteMinSales` ventes (3) : une vente arrangée entre deux comptes, ou un coup de folie isolé, ne la déplace pas. Chaque joueur qui fixe le prix (vendeur d'une enchère, acheteur d'un avis) ne pèse qu'**une voix**, la médiane de ses propres ventes, et il faut `market.quoteMinSellers` joueurs différents (2) : un vendeur qui écoule des dizaines de communes à un prix absurde ne fait pas la cote. La référence d'une rareté (repli de la valeur de collection) se calcule de la même façon, et la cote d'une carte est plafonnée à `market.quoteCapMultiplier` fois cette référence (5, 0 pour aucun plafond). La tendance compare la médiane à celle de la fenêtre précédente, de même durée.

- **Fiche carte** (wiki et collection) : cote, tendance, courbe des médianes quotidiennes et de chaque vente sur `market.quoteHistoryDays` jours (90).
- **Collection** : valeur estimée = cote de chaque exemplaire, sinon médiane récente de sa rareté ; les exemplaires sans aucune cote comptent pour 0 et sont signalés.
- **Marché** : « Plus fortes hausses », les cartes cotées sur les deux fenêtres dont la cote monte le plus.

Aucune table dédiée : tout se calcule depuis `Auction` et `BuyOrder` (`lib/market/quotes.ts` pour la logique, `server/market/quotes.ts` pour les lectures, cache de 5 minutes).

### Filtre « acquises »

Partout où le marché filtre, un filtre **Toutes · Acquises · Non acquises** (`?possession=acquises|manquantes`, `lib/market/possession.ts`). Une carte est acquise dès que le joueur en a un exemplaire, quel que soit son statut : la même règle que le badge « Acquise ». Ventes (Tout et Mes enchères ; absent de Mes ventes, où tout est au vendeur) dans le formulaire GET, avis de recherche en liens à côté du tri, échanges en puces qui se combinent avec « Je peux donner » et « Mes offres ». Côté serveur, une seule condition `card.copies some/none { ownerId }` (`server/market/possession.ts`). L'ancien filtre d'échange « Que je n'ai pas » (`filtre=missing`) vaut « Non acquises ».

## Combat 1v1

Duel **joué en direct**, façon Hearthstone : chaque joueur agit pendant son tour, le serveur arbitre tout. Trois façons de jouer : **code ami** (salle privée, non classée), **exhibition** (file d'attente, non classée) et **classé** (file d'attente, étape 9b). Personne en vue après `battle.queueSeconds` (20 s) : un **bot** prend la place, affiché comme tel, avec une équipe de même rareté que celle du joueur, différente à chaque fois.

Règles (moteur pur `lib/battle/engine.ts`, tous les chiffres dans `GameSetting` `battle.*`, figés dans le setup au lancement) :

- 3 fuda par camp, toutes sur le plateau. ATK = 力, DEF = 気, PV = 80 + 1,6 × 気, VIT = moyenne (désigne qui commence).
- À son tour, chaque carte debout agit **une fois** (deux avec 疾風) : **attaque** gratuite ou **technique 技** payée en orbes 気 (1 au premier tour, +1 par tour, 5 au plus, +1 au premier tour du second joueur). Le premier joueur n'a que `battle.firstTurnActions` (2) actions à son tout premier tour : 53 % de victoires pour lui en simulation, contre 65 % sans limite.
- Dégâts : `max(1, ATK × 100 / (100 + DEF) × critique × aléa × multiplicateur)`, critique 10 % ×1,5, aléa 0,9–1,1, en arithmétique entière.
- Passifs selon la rareté (0 Commune et Peu commune, 1 Rare et Épique, 2 Légendaire et Mythique), stables par personnage : 挑発 Provocation, 結界 Barrière, 疾風 Rafale, 毒 Poison, 反撃 Riposte, 遺言 Dernière volonté, 復活 Renaissance. Une technique par carte : 一閃 Issen, 貫通 Kantsū, 乱舞 Ranbu, 癒し Iyashi, 守護 Shugo, 鼓舞 Kobu, 封印 Fūin.
- **Nouvelles capacités** (`NEW_KEYWORDS`, `NEW_TECHNIQUES`, `lib/battle/modifiers.ts`). Passifs : Vampirisme, Rage, Cuirasse, Exécution, Concentration. Techniques : Coup absolu, Double frappe, Pluie de soin, Brume toxique, Méditation. Le tirage historique d'une carte porte toujours sur les 7 + 7 capacités d'origine, à l'identique ; chaque emplacement a ensuite `battle.newAbilityPct` % (30) de chances d'être remplacé par une nouveauté, avec un tirage séparé et stable. À 0, aucune carte ne change et les nouveautés ne s'obtiendront qu'au shop ; monter la valeur ajoute des nouveautés sans changer celles déjà attribuées. Aucune migration ni nouveau champ d'état : les capacités restent figées dans le setup, donc parties en cours et replays gardent les leurs. `parseSetting` complète `battle.keywordValues` et `battle.techniques` avec les défauts, pour qu'ajouter une capacité n'efface pas les réglages de l'admin. Équilibrage : `npm run battle:balance`, cibles 58 à 72 % de victoires pour un passif et 42 à 55 % pour une technique sur une seule carte, en miroir (`lib/battle/abilities.sim.test.ts`).
- **Les capacités se changent à l'atelier** (`/combat/atelier`) : un passif ou une technique s'achète en Zeni pour un seul personnage (pour Rafale sur 3 cartes, 3 achats), reste acquis et se rééquipe gratuitement. Le nombre d'emplacements reste celui de la rareté (une Commune ne change que sa technique) ; le kit tiré au sort est acquis d'office. Les bots gardent le leur.
- **Ultis 奥義** : les cartes des raretés cochées (`battle.ultimateRarities`, Gold, MR, Esprit et XR par défaut, case « Ultime » de l'éditeur de rareté) ont un ulti, toujours le même pour un personnage, indépendant de l'atelier (il ne s'achète pas). Une fois par partie, sans orbe, à la place de l'action de la carte, jauge pleine. Jauge sur 100 (`battle.ultimateCharge`) : +50 par action de la carte, et +200 pour la perte de tous ses PV au prorata (la moitié des PV la remplit). Cinq ultis (`battle.ultimates`) : Châtiment céleste (un coup à ×1,6 qui ignore DEF et Cuirasse et brise la Barrière sans être arrêté, Provocation respectée), Tempête de pétales (tous les ennemis à ×1), Résurrection (relève un allié à terre à 80 % de ses PV ; il n'agit pas ce tour-ci, sa Renaissance reste intacte, la synergie ne revient pas), Rempart absolu (Barrière sur chaque allié debout, poison retiré), Arrêt du temps (tous les ennemis debout passent leur prochain tour). Les bots en ont aussi.
- Minuteur `battle.turnSeconds` (30 s) ; deux tours expirés d'affilée = forfait ; abandon à tout moment ; limite de 30 tours globaux, puis le plus fort % de PV gagne (égalité = nul).

Mise en œuvre (étape 9a) :

- **Déterminisme** : une partie = setup + graine (mulberry32, `lib/rng.ts`) + actions (`BattleAction`). Le hasard de l'action n° `seq` vient de `seededRng(mixSeed(graine, seq))`. La graine reste secrète tant que la partie se joue (sinon on prédirait les critiques) ; le replay la reçoit une fois la partie finie.
- **Serveur** (`server/battle/battle-core.ts`, client injecté) : chaque action est relue sous le verrou de la partie (`FOR UPDATE` + `version`), le bot joue dans la même requête. Cartes engagées en `BATTLE` par `updateMany` conditionnel, rendues à chaque fin. File d'attente sérialisée par mode (`pg_advisory_xact_lock`). Gains `BATTLE_WIN` via le journal, dans la limite de `battle.rewards.dailyCap` (10) par jour ; aucun gain avant le 3e tour (anti-farm), ni entre amis par défaut.
- **Temps réel** : Ably, le serveur publie après le commit (`ABLY_API_KEY`, jeton d'abonnement limité aux canaux du joueur, `/api/realtime/token`). Chaque mise à jour porte sa version de départ ; un trou se rattrape en rejouant le journal côté serveur (`battleSinceAction`). Sans clé, le plateau sonde toutes les `battle.pollSeconds`.
- **Clôture paresseuse** : tours expirés, salles périmées et places de file abandonnées réglés à l'affichage, au sondage de la cloche, et par `/api/cron/battle` une fois par jour.
- **Écrans** : `/combat` (exhibition, classé, code ami, historique, règles ; choix d'équipe dans une feuille, dernière équipe pré-remplie), `/combat/[id]` (salle d'attente, plateau en direct chargé en import dynamique, replay). « Défier » sur le profil d'un ami ouvre une salle qui lui est réservée (notification `BATTLE_INVITE`). Réglages dans `/admin/combat`.
- **Decks** (`server/battle/deck-core.ts`, `/combat/decks`) : équipes nommées de 3 personnages (`Deck.cardIds`, ids de `Card`, comme `battleTeam`), au plus `battle.maxDecks` (10) par joueur ; baisser la limite bloque les créations sans rien supprimer. Enregistrer exige 3 cartes différentes possédées, tous statuts confondus. Une carte vendue depuis laisse le deck en place, affiché « indisponible » : il ne remplit plus les emplacements tant qu'il n'est pas corrigé, le renommage reste possible. Le nom (1 à 24 caractères) n'est visible que de son propriétaire, donc sans modération ; il est supprimé à l'anonymisation et figure dans l'export RGPD. Le choix d'équipe reste libre : `TeamPicker` propose les decks en raccourcis et le moteur ne voit toujours que 3 ids de `Card`, revérifiés par `lockTeam`. Une carte présente dans un deck ne peut pas être supprimée du catalogue (`IN_USE`).
- **Univers et synergie** (`Universe`, `lib/battle/synergy.ts`, `lib/catalog/universes.ts`) : trois cartes du même univers (`series.universeId ?? series.id` : une série sans groupe forme le sien) gagnent `battle.synergyAtkPct` (+10 %, 0 coupe la règle) d'ATQ, additionnés à 鼓舞, et un filament électrique rouge les encadre, pour les deux camps. Rupture définitive à la première vraie mort du camp : une carte sauvée par Renaissance ne rompt rien ; poison et riposte comptent. Tout est figé dans le setup au lancement (`setup.synergy`, `state.synergy`, événement `synergy_break`) : changer un regroupement ne touche ni les parties en cours ni les replays, et une partie sans synergie donne les mêmes chiffres qu'avant au caractère près. En miroir bot contre bot, +10 % donne 58,6 % de victoires ; la première mort survient en moyenne au tour 3,8 sur 15, donc le bonus accélère le début de partie sans durer. Les bots tirent toujours leurs cartes au hasard. Regroupement semi-automatique : `npm run catalog:universes` lit les relations AniList (SEQUEL, PREQUEL, PARENT, SIDE_STORY, ADAPTATION, SOURCE, SUMMARY, COMPILATION, CONTAINS ; SPIN_OFF et ALTERNATIVE fusionneraient tous les Precure), écrit un rapport dans `.import/` et n'écrit en base qu'avec `--apply`. Il ne traite que les séries sans univers et ne déplace jamais une série déjà rangée. `/admin/univers` corrige : créer, renommer, ranger, retirer (la série reçoit un univers à elle seule, pour que le script ne la replace pas), fusionner, supprimer.
- **Atelier** (`lib/battle/loadout.ts`, `server/battle/kits.ts`, `server/battle/ability-shop-core.ts`, `AbilityPurchase`, `CardLoadout`) : l'achat est lié au joueur et au personnage (`Card`), pas à l'exemplaire. Il exige au moins un exemplaire, quel que soit son état ; les doublons partagent le kit ; vendre, échanger ou recycler n'emporte et ne rembourse rien, et racheter la carte redonne ses achats. Achat, débit (`CoinReason.ABILITY`, la carte en `refId`) et ligne `AbilityPurchase` dans une transaction, sous le verrou du joueur ; prix revérifié (`STALE`), contrainte unique contre le double paiement, équipement immédiat si un emplacement est choisi. Kit lu à chaque lecture par `effectiveKit` : ce qui n'est plus valide ou plus acquis, les doublons et le surplus d'emplacements tombent, le kit d'origine complète, donc un emplacement n'est jamais vide. `fightersOf` lit le kit au lancement, une partie le garde figé dans son setup : un changement vaut au prochain appariement, même pour une carte déjà en file. Réglages : `battle.abilityShopEnabled` (fermé, les kits déjà choisis restent en jeu) et `battle.abilityPrices` (`{ keywords, techniques }`, complété par les défauts comme `battle.techniques`). Prix par défaut proportionnels à la valeur mesurée (`npm run battle:balance`, 1 200 parties par ligne, référence 51 %) : passifs 100 Zeni par point au-dessus de la référence (100 au moins, Rafale 3 650), techniques 400 + 50 par point au-dessus de 44 %. `/admin/combat` montre les achats par capacité sur 7 jours, pour surveiller Rafale. Achats et kits figurent dans l'export RGPD et sont gardés à l'anonymisation, comme le journal de Zeni ; une carte achetée ne peut pas être supprimée du catalogue (`IN_USE`). Les dépenses de l'atelier comptent pour les missions « dépenser des Zeni ». Pas de paiement en argent réel tant que les packs Stripe restent coupés : sinon l'atelier deviendrait du pay-to-win en classé.
- **Ultis** (`ULTIMATES`, `ultimateFor` dans `lib/battle/stats.ts`, `castUltimate` dans `lib/battle/engine.ts`) : tiré de façon stable sur la liste d'origine `LEGACY_ULTIMATES`, à ne jamais réordonner ; des ultis ajoutés plus tard seront tirés à part. Aucune migration : l'ulti est figé dans le setup (`FighterSetup.ultimate`), la jauge vit dans l'état (`charge`, `ultUsed`, présents seulement sur une carte qui a un ulti), donc une partie d'avant se rejoue aux mêmes chiffres. Action `ULTIMATE` revérifiée par `checkAction` (jauge pleine, une seule fois, même budget d'actions, Provocation) ; événements `ultimate` et `raise` (distinct de `revive`, pour ne pas consommer la Renaissance), `block` avec `pierced` quand la Barrière cède. Plateau : jauge dorée sous les PV, halo quand elle est pleine, 4e tablette « Ultime » (un ulti sans cible s'arme au premier toucher et part au second), carte à terre touchable seulement comme cible de Résurrection, cut-in doré complet à chaque fois, ralenti, réaction de l'arène et impact frame en effets complets. `battle.ultimates` est complété par les défauts comme `battle.techniques`. Équilibrage (`npm run battle:balance`, une carte avec l'ulti contre la même équipe sans, cible 58 à 68 %, verrouillée par `abilities.sim.test.ts`) : à +25 par action et +50 pour tous les PV, la partie (4 tours par camp) finissait avant la jauge, 0 à 14 % d'ultis lancés ; d'où +50 et +200, et des valeurs abaissées (×3 et ×1,3 dépassaient 70 %).
- **Plateau** : table laquée, un tapis par camp, ligne de front avec médaillon du tour ; gemmes 力/PV aux coins des fuda ; l'attaquant fonce sur sa cible et revient (Web Animations, transform seulement), éclaboussure d'encre, gros chiffres détourés, 会心 sur un critique ; journal et détail de la carte en colonne sur desktop. En classé, le liseré, la ligne de front et le médaillon prennent la couleur du rang (`data-tier` : bronze, argent, or, émeraude, élite indigo, champion écarlate, grand champion nacre violet et blanc) ; aperçu admin avec `?rang=GOLD`.
- **Tests** : `lib/battle/*.test.ts` (formule, chaque passif et technique, orbes, minuteur, limite de tours, replay identique, 2 000 parties bot contre bot) ; `server/battle/battle.db.test.ts` (actions simultanées, appariement simultané de 4 joueurs, file contre mise en vente, plafond quotidien, balayage, salles, bot), sauté sans `DATABASE_URL_TEST`.

### Mode classé

Un seul nombre, les points de classement (PC), fixe le rang. Chaque division couvre 100 PC, et Grand Champion est réservé aux 100 meilleurs joueurs. Plus on monte, moins une victoire rapporte et plus une défaite coûte, sauf quand la victoire est écrasante : elle garde un gain élevé à tous les rangs.

| Rang | Divisions | PC | Victoire | Victoire écrasante | Défaite | Défaite écrasante |
| --- | --- | --- | --- | --- | --- | --- |
| Bronze | III, II, I | 0–299 | +30 | +40 | −10 | −15 |
| Argent | III, II, I | 300–599 | +27 | +38 | −13 | −19 |
| Or | III, II, I | 600–899 | +24 | +36 | −16 | −24 |
| Émeraude | III, II, I | 900–1 199 | +21 | +34 | −19 | −28 |
| Élite | III, II, I | 1 200–1 499 | +18 | +32 | −22 | −33 |
| Champion | III, II, I | 1 500 et + (I dès 1 700) | +15 | +30 | −25 | −38 |
| Grand Champion | aucune, top 100 | ≥ 1 800 et dans les 100 premiers | +12 | +28 | −28 | −42 |

Règles :

- **Écrasante** : le gagnant finit avec au moins 60 % des HP totaux de son équipe, ou sans avoir perdu une seule carte. Le même critère rend une défaite écrasante pour le perdant.
- **Écart de niveau** : battre un adversaire mieux classé rapporte plus, perdre contre lui coûte moins (±50 % au maximum, voir le code).
- **Plancher** : 0 PC, on ne descend pas sous Bronze III.
- **Protection** : après une montée de rang (Argent → Or, par exemple), 3 parties sans pouvoir redescendre au rang inférieur. Rien entre divisions d'un même rang.
- **Grand Champion** : recalculé toutes les minutes (`ORDER BY "rankPoints" DESC LIMIT 100` parmi les joueurs à 1 800 PC ou plus, avec un index sur `rankPoints`). Qui sort du top 100 redevient Champion I sans perdre de PC.
- **Adversaires** : file d'attente classée en direct, adversaire à ±150 PC (fourchette qui s'élargit avec l'attente) ; personne en vue → un bot affiché comme tel, qui rapporte ou coûte une part réduite des PC (réglable). Les défis entre amis restent non classés, ce qui bloque le farm entre amis. (L'ancienne idée d'une `defenseTeam` hors ligne est abandonnée.)
- **Saisons** : tous les 2 mois. Au reset, PC = 600 + (PC − 600) × 0,5 pour les joueurs au-dessus de 600, et un lot de fin de saison par rang atteint.

```ts
// lib/ranked.ts — valeurs par défaut, surchargées par GameSetting "ranked.tiers"
const TIERS = [
  { name: "Bronze",   min: 0,    win: 30, crushWin: 40, loss: 10, crushLoss: 15 },
  { name: "Argent",   min: 300,  win: 27, crushWin: 38, loss: 13, crushLoss: 19 },
  { name: "Or",       min: 600,  win: 24, crushWin: 36, loss: 16, crushLoss: 24 },
  { name: "Émeraude", min: 900,  win: 21, crushWin: 34, loss: 19, crushLoss: 28 },
  { name: "Élite",    min: 1200, win: 18, crushWin: 32, loss: 22, crushLoss: 33 },
  { name: "Champion", min: 1500, win: 15, crushWin: 30, loss: 25, crushLoss: 38 },
];
const GRAND_CHAMPION = { name: "Grand Champion", min: 1800, win: 12, crushWin: 28, loss: 28, crushLoss: 42 };

export function rankOf(pc: number, inTop100: boolean) {
  if (inTop100 && pc >= GRAND_CHAMPION.min) return { tier: GRAND_CHAMPION.name, division: null };
  const t = TIERS.findLast((t) => pc >= t.min)!;
  const division = Math.max(1, 3 - Math.floor((pc - t.min) / 100)); // 3 = III, 1 = I
  return { tier: t.name, division };
}

export function isCrushing(winnerHpLeft: number, winnerHpMax: number, winnerCardsLost: number) {
  return winnerCardsLost === 0 || winnerHpLeft / winnerHpMax >= 0.6;
}

export function pcDelta(pc: number, oppPc: number, won: boolean, crushing: boolean, inTop100: boolean) {
  const t = inTop100 && pc >= GRAND_CHAMPION.min ? GRAND_CHAMPION : TIERS.findLast((t) => pc >= t.min)!;
  const gap = Math.max(-0.5, Math.min(0.5, (oppPc - pc) / 400)); // adversaire plus fort → gap > 0
  if (won) return Math.round((crushing ? t.crushWin : t.win) * (1 + gap));
  return -Math.round((crushing ? t.crushLoss : t.loss) * (1 - gap));
}
```

Applique le delta dans la même transaction que le résultat du combat, avec `Math.max(0, pc + delta)`, et enregistre `ranked`, `crushing` et `pcDelta` sur le `Battle` pour l'historique. Sur le téléphone, l'écran de fin affiche l'emblème du rang, la barre de la division qui se remplit ou se vide, et « Victoire écrasante » quand c'est le cas.

Mise en œuvre (étape 9b) :

- **Règles pures** (`lib/ranked/rules.ts`, `season.ts`, testées) : `rankOf`, `pcDelta`, `applyResult` (plancher, protection), `matchRange`, `botDelta` (50 %, arrondi qui s'éloigne de zéro), `nextSeasonBoundary`, `resetPc`. Tout le barème est dans `GameSetting` `ranked.*`, éditable dans `/admin/classe`.
- **PC** : appliqués par `applyRankedWith` (`server/ranked/ranked-core.ts`) dans la transaction qui termine la partie (`persist`), les deux joueurs verrouillés ; top 100 relu en base. Anti-boost : un abandon ou un minuteur avant le 3e tour ne rapporte rien au gagnant. Le rang de chaque camp est figé au lancement (`Battle.p1Tier`/`p2Tier`) et colore le plateau.
- **Appariement** : la file `RANKED` n'accepte qu'un écart de PC de `base` + `perSecond` × attente (au plus `max`), calculé en SQL ; bot au bout de `battle.queueSeconds`.
- **Saisons** (`Season`, `SeasonResult`) : calées sur le calendrier, tous les `ranked.seasonMonths` mois, le 1er à minuit (fuseau du jeu). Clôture idempotente (verrou sur la saison) à l'affichage de `/combat`, à l'entrée en file classée et par `/api/cron/battle` ; clôture anticipée depuis `/admin/classe`. Récompense : le lot du meilleur rang atteint (`ranked.rewardLots`), à réclamer une fois depuis `/combat` (`CoinReason.SEASON`).
- **Écrans** : panneau classé de `/combat` (emblème, division, PC, protection, fin de saison), bilan classé de l'écran de fin et du replay, ±PC dans l'historique, onglet « Classé » de `/classement` (top 100 en cache 60 s, profils publics), emblèmes SVG des 7 rangs (`components/ranked/RankEmblem.tsx`).
- **Tests** : `lib/ranked/rules.test.ts` ; `server/ranked/ranked.db.test.ts` (fourchette, PC appliqués une fois, fins simultanées, anti-boost, bot, protection, Grand Champion, fin de saison et réclamation), sauté sans `DATABASE_URL_TEST` (il clôt la saison ouverte de la base de test).

## Boutique, casino et serveur Discord

**Boutique** (`/boutique`). Boosters et bannières vedettes payables en Zeni dès le lancement. Une zone « Packs premium » est prévue pour le paiement par carte via Stripe Checkout, mais reste masquée tant que l'interrupteur admin est coupé (voir Points légaux avant de l'activer). Les articles viennent de `ShopItem` ; chaque achat crée un `Purchase`.

### Mise en œuvre (étape 7)

- **Service unique des Zeni** (`server/economy/ledger.ts`) : `credit`, `debit` et `applyEntries` font chaque mouvement en un seul `UPDATE … WHERE coins + δ >= 0 RETURNING coins` puis écrivent la ligne `CoinTransaction` avec `balanceAfter`. Inscription, bonus Discord, ouverture payante, cadeau et recyclage passent tous par lui ; la base porte en plus `CHECK (coins >= 0)`.
- **Crédits de boosters** (`BoosterCredit`, un compteur par joueur et par type) : cadeaux d'amis, boutique, missions et parrainage. `User.giftBoosters` y a migré. Un crédit s'ouvre depuis l'accueil (`/ouvrir/[slug]?credit=1`), même après la fin d'un événement, avec la pitié Mythique mais sans doré ni divin.
- **Lots** (`Lot`, `LotItem`) : Zeni, boosters d'un type, carte précise ou carte tirée dans une rareté (pool du booster standard). Versés par `grantLot` dans la transaction de ce qui les cause. `/admin/lots`.
- **Missions** (`Mission`, `UserMission`) : quotidiennes et hebdomadaires dans le fuseau `game.timeZone` (semaine ISO, lundi). La progression est **dérivée des journaux** (ouvertures, raretés tirées, découvertes, recyclage, dépenses, cadeaux, amitiés), recalculée sous verrou au moment de réclamer ; la clé `(userId, missionId, periodKey)` interdit la double réclamation. `/missions`, `/admin/missions`.
- **Parrainage** (`Referral`, code court de 8 caractères généré par la base) : lien `/i/[code]` (cookie httpOnly 30 j, rien en base) puis rattachement à l'inscription ou par saisie dans `referral.attachWindowDays`. Refus : soi-même, invité, déjà parrainé, cycle, blocage, parrain au plafond `referral.maxPerMonth`, plus de 3 rattachements par IP et par jour. Rien n'est versé avant la **qualification** (compte vérifié, `referral.minAccountAgeHours`, `referral.minBoostersOpened` boosters ouverts depuis le rattachement), évaluée à la visite de `/parrainage` et à l'ouverture de boosters du filleul ; chacun réclame ensuite son lot (`referral.referrerLotId`, `referral.refereeLotId`). `/admin/parrainage` pour révoquer. Refonte prévue à l'étape 18 : voir « Parrainage v2 et événement Ennichi ».
- **Boutique en Zeni** (`ShopItem` livre un lot, `Purchase`) : prix vu revérifié (`STALE`), limite par joueur (une fois, par jour, par semaine) comptée sous verrou, puis `fulfillPurchase`. `/boutique`, `/admin/boutique`.
- **Paiement par carte** : interface seulement (`server/payments/provider.ts`, `getPaymentProvider()` renvoie `null`). Brancher Stripe = écrire le fournisseur et une route webhook qui appelle `fulfillPurchase`, le même chemin que l'achat en Zeni ; la zone « Packs premium » exige `shop.premiumEnabled` **et** un fournisseur.
- **Historique** `/compte/historique` (pièce de l'en-tête et solde du Compte) : par curseur, filtres Tout · Gains · Dépenses, lien vers la source. `/admin/economie` affiche les Zeni en circulation et la liste des soldes qui ne correspondent pas à leur journal (doit rester vide).
- **Tests** : `lib/economy/*.test.ts` ; `server/economy/economy.db.test.ts` (50 débits simultanés, double réclamation de mission, achats limités, double rattachement et double réclamation de parrainage, soldes = journal).

**Casino.** Pile ou face entre joueurs, sans Zeni ni argent réel : voir la section « Casino ».

**Serveur Discord.** Un modal « Rejoins notre Discord » (titre, texte, bouton vers le lien d'invitation), **désactivé par défaut**. Depuis l'admin, tu l'actives, changes le lien, le texte et le moment d'affichage. Il est distinct de la connexion Discord du compte.

```ts
// GameSetting "discord.joinModal" — valeur par défaut
{
  enabled: false,
  inviteUrl: "",
  title: "Rejoins notre Discord",
  body: "Annonces, échanges et entraide entre joueurs.",
  trigger: "AFTER_BOOSTERS", // AFTER_BOOSTERS | ON_VISIT
  afterBoosters: 3,
  cooldownDays: 7,           // ne le remontre pas avant 7 jours après un « Plus tard »
  showInFooter: true,
}
```

Un clic sur « Rejoindre » enregistre `discordJoinedAt` et le modal ne réapparaît plus pour ce joueur.

## Mode spoiler

Certains personnages ou transformations (variantes) dévoilent l'histoire. Dans l'admin, la case **Spoil** de la fiche carte (`Card.spoiler`, une variante reprend la valeur de sa carte de base) les marque ; la liste du catalogue affiche une pastille.

- **Réglage du joueur** : « Mode spoiler » (Flouter les spoils / Tout afficher) dans Compte → Préférences et le menu « Plus » mobile. **Activé par défaut** : toute carte spoil est floutée, pour tout le monde et sans compte. Le réglage est sur le compte (`User.spoilerBlur`, défaut `true`) et suit le joueur d'un appareil à l'autre ; l'ancien cookie `kiraku-spoiler` n'est plus lu.
- **Par univers** (`/compte/spoilers`) : liste des univers qui ont des cartes spoil (archivées comprises), chacun flouté par défaut ; le joueur décoche ceux qu'il a rattrapés (`User.spoilerShown`, 300 clés au plus). Clé d'univers = `series.universeId ?? series.id`, la même que la synergie de combat : une série rangée dans aucun univers forme sa propre entrée. Un nouvel univers, ou une carte dont la source ne fournit pas de clé, reste flouté. Un regroupement changé plus tard dans `/admin/univers` change la clé : les cartes concernées redeviennent floutées (côté sûr), et les caches du catalogue sont vidés. Actions `server/actions/spoiler.ts` (session, Zod, rate limit `spoiler:<id>` 60/min, tableau mis à jour en une requête).
- **Rendu** : seule l'illustration d'une carte spoil est floutée ; cadre, rareté, sceau, nom, série et stats restent. La carte transporte son drapeau public `spoiler` (obligatoire dans `FudaCard`) et sa clé `spoilerKey` (seulement pour une carte spoil) ; `Fuda` pose `data-spoiler` sur l'image et `data-spoiler-u` (la clé) sur la fuda, les vignettes posent les deux sur l'image (`spoilerImageAttrs`). Une règle CSS (`FudaFace.css`, et `globals.css` pour les vignettes, fantômes AR, cut-in, couvertures d'album et formes liées du wiki) floute sous `:root[data-spoiler="hide"]` en lisant les variables `--kn-spoiler-*`, flou en repli. `SpoilerPreferenceProvider` (layout) rend une petite feuille `spoilerRevealCss` qui règle ces variables pour les univers en clair, et la change sans recharger ; clés validées (cuid) avant d'y entrer. Les caches du catalogue restent communs à tous les joueurs. L'URL de l'image reste dans la page : c'est une protection choisie par le joueur, pas un secret. Pas de dévoilement au cas par cas.
- **Hors du site** (la préférence du lecteur y est inconnue) : jamais d'illustration spoil. La fiche wiki d'une carte spoil prend l'image de partage du site, l'image de partage ignore les cartes spoil, et les annonces du bot Discord (enchères, échanges) partent sans image.
- **Admin** : l'éditeur, son aperçu et la liste du catalogue montrent toujours l'image en clair.
- Les combats copient le drapeau dans `Battle.setup` au lancement, et la clé d'univers y est déjà (`universe.key`) ; une partie lancée avant le mode n'a pas le champ et ne floute rien.

## Event vitrines

Concours de la plus belle vitrine, sur `/event` : la page de l'event en cours, qui changera d'un event à l'autre. Caché tant que l'admin ne l'allume pas.

- **Participer** : chaque joueur inscrit (pas invité, ni banni ni gelé) engage une seule de ses vitrines (`ShowcaseEventEntry`, une par joueur et par édition). Elle est photographiée à l'inscription : disposition, thème affiché, nom et cases, en ids de `Card` (un exemplaire quitte les vitrines quand il change de main, la photo ne bouge pas). Modifier la vitrine ensuite ne change rien. Le joueur peut retirer sa participation (ses votes reçus partent avec elle) et en inscrire une autre tant que l'event est ouvert. Minimum de cartes : `event.showcase.minCards`.
- **Voter** : un vote par joueur inscrit et par édition (`ShowcaseEventVote`), changeable ou retirable à tout moment, jamais pour sa propre vitrine. Les invités voient les vitrines et une invitation à créer un compte.
- **Calendrier** : une seule période `[startsAt, endsAt[` où l'on s'inscrit et vote. `event.showcase.edition` range inscriptions et votes : la changer démarre un nouvel event (l'ancien reste en base).
- **Galerie** : une vitrine par ligne, « Vitrine de [pseudo] » au-dessus, « Voter pour [pseudo] » en dessous, en version légère (fond fixe chargé à l'approche, sans vidéo ni halo, cartes figées), paginée par `event.showcase.pageSize`. Pendant l'event, ordre mélangé propre à chaque joueur (`seededOrder`) et aucun compteur. Les cartes viennent de `cardViews` : le mode spoiler s'applique.
- **Résultats** : à la clôture seulement. Classement par votes (votants non bannis), à égalité la vitrine qui a atteint son score la première, puis la plus ancienne inscription (`rankEntries`). Podium du top 3 (金 銀 銅) sur `/event` et dans la section des classements de l'accueil ; pendant l'event, l'accueil montre une invitation. Entrée « Event » dans les menus « Plus » quand l'event est allumé.
- **Admin** (`/admin/evenement/vitrines`) : interrupteur, édition, dates, minimum de cartes, taille des pages, aperçu de `/event` même caché, inscriptions avec leurs votes en direct et retrait de modération (`SHOWCASE_EVENT_ENTRY_REMOVE` dans `AdminLog`).
- **Code** : règles pures dans `lib/event/showcase.ts`, écritures sous verrou du joueur dans `server/event/showcase-core.ts`, lectures dans `server/event/showcase-queries.ts`, actions dans `server/actions/showcase-event.ts`. Anonymisation et export « Mes données » couvrent inscriptions et votes. Pas de lot automatique pour les gagnants : l'admin les envoie depuis les lots.

## Fresques 絵

Une grande image découpée en **4 colonnes × 3 lignes** (image 4:3, fragments carrés). Ce n'est pas une rareté de carte : un fragment n'a ni stats, ni combat, ni recyclage, ni marché. C'est un objet à part, au sceau 絵, glissé dans un booster en plus de ses cartes.

- **Chute** : un jet par booster enregistré (stock, Zeni, crédit ou sachet scellé ; jamais un booster garanti, un lot ou une mission), à `fresco.dropRate` points de base (550, soit 1 booster sur 18 : la chance qu'une des 4 cartes soit une Épique à 1,4 %). La fresque est tirée au poids (`Fresco.dropWeight`) parmi les publiées qui tombent de ce booster (`boosterTypeIds`, vide = tous) et que le joueur n'a pas finies, puis un fragment qui lui manque. **Jamais de doublon** : 12 fragments suffisent (environ 220 boosters par fresque seule en jeu), et une fresque finie ne tombe plus. Interrupteur `fresco.enabled`.
- **Lots** : chaque fresque choisit quatre lots facultatifs, versés une seule fois par joueur : chaque nouveau fragment, chaque ligne remplie, chaque colonne remplie, la fresque complète. `FrescoReward` (clé joueur, fresque, type, index) rend le versement idempotent ; les lots passent par `grantLot` (`CoinReason.FRESCO`) après le débit des boosters, dans la même transaction, sous le verrou du joueur.
- **Ouverture** : après les cartes, chaque fragment se pose sur sa case de la fresque, avec la progression, le tampon « Ligne complète », « Colonne complète » ou 完, et le contenu des lots (cartes révélées comme au sortir d'un booster) ; rangée « Fragments de fresque » dans le récap (`components/opening/FrescoFragmentReveal.tsx`, chargé à la demande).
- **Vitrine** : le propriétaire choisit, dans le mode édition de la vitrine (bouton « Fresque »), la fresque qu'il met en avant et la vue ouverte d'abord (`Showcase.frescoId`, `frescoFirst`). À côté de « Vitrines », une mini-navigation **Cartes · Fresque** bascule entre les deux vues, sur le même décor. Complète, la fresque s'affiche comme l'image d'origine ; sinon seuls les fragments possédés, les cases manquantes restent transparentes.
- **Nouveautés** : onglet **Nouvelles fresques** (`/wiki/nouveautes?onglet=fresques`) dès la première publication : aperçu flouté de 48 px (jamais l'image), boosters, lots, progression du lecteur, badge « Nouveau » pendant `fresco.newHours`. Tag `NEW_FRESCO` et sceau 絵 pour les bannières de l'accueil.
- **Pas de spoil** : brouillon invisible de tous (ni chute, ni onglet, ni bouton, ni image) ; `hasPublishedFresco()` conditionne chaque entrée. Un joueur ne reçoit que les URL de ses fragments, l'image entière une fois la fresque complète. Images découpées à l'envoi sous des noms aléatoires (`frescoes/<uuid>`, suffixe aléatoire) : aucun fragment ne se devine. Admin seulement (pas le DEV), banc de test compris. Mode spoiler comme une carte (`Fresco.spoiler`, univers).
- **Admin** (`/admin/fresques`) : réglages et chances affichées, création, éditeur avec dépôt d'image découpée dans le navigateur (cadrage 4:3, aperçu immédiat), redécoupée par le serveur avec sharp (`server/fresco/cut.ts`, 2400 × 1800 au plus, 1200 × 900 au moins), lots, boosters, poids, spoiler, et aperçu en direct avec les composants des joueurs (profil en Téléphone ou Ordinateur, Yoru ou Washi, ouverture, Nouveautés), cases à cocher pour simuler ce que le joueur possède. Publier (il faut les 12 fragments), archiver (ne tombe plus, les détenteurs la gardent), supprimer un brouillon jamais distribué. Une fresque publiée ne change plus d'image. Scénario « Fragment de fresque » dans `/admin/test-ouverture`. Les lots d'une fresque comptent comme partagés pour `/admin/parrainage/lots`.
- **Données** : `Fresco`, `FrescoPiece`, `UserFrescoPiece`, `FrescoReward` (migration `fresques`, uniquement additive). Logique pure dans `lib/fresco/` (grille, progression, tirage, chances), écritures dans `server/fresco/award-core.ts` et `admin-core.ts`. Les fragments restent au prestige et suivent l'export « Mes données ».

## Expéditions

Mini-jeu PvE sur `/expedition` (étape 14) : chaque jour, chaque joueur reçoit ses routes et y envoie une équipe de 3 cartes pendant plusieurs heures, contre des Zeni et des boosters « Tout anime ». Caché tant que l'admin ne l'allume pas (`expedition.enabled`) : 404 pour les joueurs (sauf expédition encore en route ou résultat à révéler), aperçu pour l'admin, rien dans la nav ni dans les tuiles du Compte.

- **Paliers** : les raretés de même rang (`sortOrder`) forment un palier : Épique, Légendaire, Mythique + BR, AR + VR, Gold + MR, Esprit, XR. Chaque modèle exige au moins une carte de sa rareté (ou mieux) ; l'équipe compte 3 personnages différents, comme en combat.
- **Chances** : `base + Σ bonus(écart de palier)` (`expedition.cardBonus` : 2 et 4 points à deux et un palier en dessous, 10 au même palier, puis 14, 17 et 20 au-dessus). La réussite plafonne au `maxSuccessPct` du modèle ; le surplus devient du **triomphe** (gains × `expedition.triumphRewardPct`, 150 %, boosters arrondis au supérieur), plafonné par `maxTriumphPct`. Une XR périlleuse (base 20) : 30 % avec une XR, 50 % avec trois. Échec : `expedition.failRewardPct` (25 %) des Zeni, jamais de booster ; les cartes reviennent toujours.
- **Risques** : sûre (base = plafond = 100 %, gains modestes), équilibrée, périlleuse (gros gains, peut exiger une part du catalogue découvert, `Discovery`). Catalogue par défaut (`lib/expedition/catalog.ts`, installé depuis l'admin) : 18 modèles, trois par palier, d'1 h (Épique sûre, 150 Zeni + 1 booster) à 24 h (XR périlleuse, 5 000 Zeni + 20 boosters + 1 Mythique tirée).
- **Offres du jour** (`ExpeditionBoard`) : tirage à graine (joueur + jour du fuseau du jeu), figé à la première lecture. La première est sûre (dans un palier que le joueur peut remplir), la dernière périlleuse, paliers et durées tous différents, pondérés par `weight`. Chaque offre se joue une fois par jour ; un abandon la laisse rejouable.
- **Cycle** : une seule expédition en route (index unique partiel). Les cartes passent en `CardStatus.EXPEDITION` : marché, échanges, cadeaux, recyclage et combat les refusent d'eux-mêmes (ils exigent `COLLECTION`) ; elles restent dans les vitrines. Abandon : cartes rendues, aucun gain, `expedition.abandonCooldownHours` (3 h) d'attente. Fin normale : relance immédiate.
- **Résultat** : tiré à la clôture (jamais au lancement), `crypto.randomInt(0, 10 000)` contre les chances photographiées au départ (`Expedition.snapshot`, `successPct`, `triumphPct` en points de base). Clôture idempotente sous le verrou du joueur : Zeni par le grand livre (`CoinReason.EXPEDITION`), boosters en `BoosterCredit`, lot bonus par `grantLot`, cartes rendues, notification `EXPEDITION_RETURNED` (Web Push). Déclenchée à l'affichage de la page, au sondage de la cloche et par `/api/cron/expedition` (toutes les 5 min sur le VPS, une fois par jour sur Vercel), même jeu coupé.
- **Écran** : laissez-passer (tegata) du jour, feuille d'équipe avec jauge ensō en direct et équipes proposées (optimale, économe), départ en maintenant le bouton, séquence de départ (sceau 遠征), rouleau peint (emakimono) du voyage avec compte à rebours et carnet de route, rapport scellé à ouvrir (大成功 · 成功 · 失敗), repos après abandon, journal. Animations en transform et opacity, mouvement réduit respecté, séquences en import dynamique.
- **Admin** (`/admin/expeditions`) : interrupteur (aussi sur `/admin/fonctionnalites`), réglages, modèles par palier avec l'aperçu d'équilibrage (chances et gains attendus, Zeni par heure), installation du catalogue par défaut, suppression d'un modèle jamais joué (sinon désactivation), expéditions en route et rappel (cartes rendues sans gain, `AdminLog`), chiffres des 7 derniers jours.
- **Code** : règles pures dans `lib/expedition/` (testées), écritures dans `server/expedition/expedition-core.ts` (client injecté), lectures dans `server/expedition/queries.ts`, actions dans `server/actions/expedition.ts` et `admin-expedition.ts`, écran dans `components/expedition/`. Export RGPD : section `expeditions`. Tests de base : `server/expedition/expedition.db.test.ts`.

## Casino

Premier jeu : un **pile ou face entre vrais joueurs** (表 face, 裏 pile), sans bot. Chacun mise une fuda du même palier, le gagnant emporte les deux. On n'y mise **ni Zeni ni argent réel** : un lancer payé en Zeni serait un pari, et rien n'y est vendu. Pas de contrôle d'âge (décision du 16 novembre 2026) : une mention « Tout est virtuel » sur chaque écran du casino, et une clause dans les CGU.

**Ouverture** pilotée par `casino.opensAt` (`lib/casino/phase.ts`) :

- `features.casino` éteint : casino caché aux joueurs, aperçu pour l'équipe ;
- date vide : teaser « Bientôt » sans compte à rebours ; date future : teaser avec compte à rebours (façade fermée en boucle, ombre de la pièce derrière le shōji) ;
- date passée : casino ouvert. Pendant `casino.newBadgeDays` jours : badge « Nouveau » (menu et tuile du Compte), cérémonie jouée une fois par appareil (`kiraku.casino-ceremony`, sautée en mouvement réduit), modale « Le casino ouvre ses portes » pour les comptes inscrits avant l'ouverture (jamais aux invités).
- L'équipe (ADMIN, DEV) voit le hall et peut jouer en aperçu avant l'ouverture.

**Tables ouvertes asynchrones** (`CoinFlip`, `server/casino/coinflip-core.ts`) :

- **Poser** : une fuda et une face. L'exemplaire passe en `CardStatus.CASINO` (séquestre) : tous les autres transferts filtrent `COLLECTION`, il ne peut donc être ni vendu, ni échangé, ni offert, ni recyclé, ni engagé en combat ; il reste en vitrine jusqu'au transfert. Toute carte est misable, dernier exemplaire compris, après un avertissement net (`casino.coinflip.lastCopyAllowed`).
- **Réserver** une table à un ami ou à un ancien adversaire (« Revanche ») ; l'invité reçoit `COINFLIP_INVITE` et peut décliner.
- **Relever** avec une fuda du même palier : le `sortOrder` du registre (Mythique = BR, AR = VR, Gold = MR). La pièce est lancée aussitôt sur le serveur ; les deux cartes vont au gagnant par des `updateMany` conditionnels. Le créateur reçoit `COINFLIP_RESOLVED` sans l'issue : le lancer se rejoue à son retour (`creatorSeenAt`), ou en direct s'il attend sur la page de sa table (temps réel `coinflip`, sondage en secours).
- **Retirer** sa table tant qu'elle est ouverte ; sans preneur, elle expire au bout de `casino.coinflip.expiryHours` et la carte revient (`COINFLIP_RETURNED`). Balayage paresseux (cloche, page de la table, relève d'une table échue) et `/api/cron/casino` chaque jour.
- **Garde-fous** : pas d'invités, pas de comptes de moins de `casino.minAccountAgeHours`, pas de joueurs bloqués dans un sens ou dans l'autre, `casino.coinflip.maxOpenTables` tables ouvertes, `casino.coinflip.dailyLimit` lancers par jour de jeu (tables posées et relevées), comptés sous le verrou du joueur.
- **Ordre des verrous** partout : la ligne `CoinFlip`, puis les joueurs triés par id. La suppression d'un compte, le bannissement, la demande de suppression et l'anonymisation ferment ses tables et rendent les cartes des tables qui lui étaient réservées.

**Tirage vérifiable** (`lib/casino/fairness.ts`, Web Crypto côté serveur et navigateur) : à l'ouverture, une graine de 32 octets est tirée et seule son empreinte SHA-256 est publiée ; l'issue est le premier octet de HMAC-SHA256(graine, id de la table), pair → 表, impair → 裏. La graine n'est révélée qu'une fois la table jouée ; « Vérifier le tirage » refait les deux calculs dans le navigateur.

**Écrans** (`components/casino/`) : hall `/casino` (carte peinte du pile ou face, jeux scellés, jauge de l'inauguration, fil des derniers lancers), salon `/casino/pile-ou-face` (tables par palier, mes tables et invitations, historique et statistiques, « Poser une carte »), page partageable et non indexée `/casino/pile-ou-face/[id]` (attente, relève, lancer, résultat, vérification). Le lancer (`CoinFlipStage`, chargé à la demande) : face-à-face et 対, pièce 3D aux vraies faces, **Lancer** en dessous de Légendaire et **Toupie** au-dessus, de 3 s (Commune) à 5 s (au-dessus de Mythique), sceau de la face gagnante, pot qui file vers le gagnant, 勝 ou 負 sur un trait de sumi. La chorégraphie est pure et testée (`lib/casino/choreography.ts`) : la pièce retombe toujours sur la face tirée par le serveur, jamais de « presque gagné ». Un appui passe l'animation ; en mouvement réduit, l'état final s'affiche directement. Visuels peints dans `public/casino` (une semaine de cache, renommer un fichier qui change).

**Lancement** : jauge communautaire en lancers (`home.eventGauge.metric = COINFLIPS`, récompense pour tous `home.eventGauge.rewardLotId`, envoyée depuis `/admin/lots`), bannière Nouveautés avec le sceau 賭, annonces Discord (`docs/DISCORD.md` : teaser à la main, ouverture postée une fois par le cron, relais des lancers à partir de `discord.casinoMinRarity`).

**Admin** `/admin/casino` : date d'ouverture (« Ouvrir maintenant »), badge et cérémonie, garde-fous, raretés jouables, santé du séquestre (tables ouvertes = cartes `CASINO`), statistiques sur 30 jours (lancers par jour, répartition 表 / 裏, victoires du créateur), tables ouvertes avec retrait motivé (`AdminLog`).

**Tests** : règles pures (`lib/casino/*.test.ts`), migration rejouée en PGlite (`server/casino/migration.test.ts`), concurrence sur base (`server/casino/coinflip.db.test.ts` : 20 relèves simultanées, relève contre retrait, quota sous charge, conservation des cartes), rendus du salon et de la vérification.

## Prestige : renaissance, héritières et éditions gravées

Fin de partie pour les joueurs qui approchent la fin du catalogue (étape 16), sur `/prestige`. Caché tant que l'admin ne l'allume pas (`prestige.enabled`, aussi sur `/admin/fonctionnalites`) : 404 pour les joueurs, aperçu pour l'admin, aucun bouton. Le principe : le joueur recycle sa collection pour repartir de zéro, mais garde 20 cartes de son choix ; les cartes gardées prestige après prestige deviennent des pièces rares, et chaque nouveau cycle peut faire sortir des **éditions gravées numérotées** qui n'existent pas au premier. La renaissance existe ailleurs : ce qui fait Kiraku, c'est l'héritage porté par l'exemplaire, la consécration au sanctuaire et les tirages d'estampe numérotés avec leur provenance. Rien ne reprend le nom, l'écran ni les visuels d'un autre jeu.

### Vocabulaire

| Notion | Porté par | Évolution |
| --- | --- | --- |
| **Prestige** du joueur | `User.prestige` | 0, 1, 2… monte à chaque renaissance, ne redescend jamais |
| **Héritage** d'un exemplaire (継承) | `UserCard.heritage` | 0 à 5 : prestiges traversés d'affilée ; l'exemplaire le garde quand il change de main |
| **Édition gravée** (estampe, hanga) | `UserCard.printing` + `UserCard.serial` | Mythique et au-dessus ; numéro fixé à la sortie du booster, jamais réattribué |
| **Exemplaire spécial** | héritage > 0 ou tirage renseigné | le serveur ne le choisit jamais tout seul |
| **Consécration** (奉納) | `ConsecratedCard` | une héritière au plafond quitte le jeu pour le sanctuaire du profil, pour toujours |

Aucune de ces propriétés ne change les stats en combat ni en expédition : leur valeur tient à la rareté, à l'histoire et à l'affichage.

### Renaissance

- **Condition** : compte inscrit (ni invité, ni banni, ni gelé) qui possède, **dans chaque rareté**, au moins `prestige.requiredPercent` % des cartes publiées de cette rareté, en cartes distinctes :

  | Rareté | Seuil par défaut |
  | --- | --- |
  | Commune, Peu commune, Rare | 85 % |
  | Épique, Légendaire | 80 % |
  | Mythique | 70 % |
  | Variantes (BR, AR, VR, Gold, MR, XR) | 40 % |

  Le nombre exigé est arrondi au supérieur (`possédées × 100 ≥ seuil × publiées`). Une rareté sans carte publiée, réglée à 0 % ou absente du réglage est ignorée (l'admin signale une rareté absente). Les variantes sont à 40 % parce que le booster standard n'en donne presque pas : Gold sort à 2 sur 100 000, BR, VR, MR et XR à 0. Le calcul réutilise le décompte par rareté de `getCollectionSummary` et les totaux de `getCatalogStats`.
- **Préparation** : refusée (`BUSY`) tant qu'un exemplaire n'est pas en `COLLECTION` (enchère, combat ou file d'attente, expédition, table de casino) ou que le joueur a lui-même une annonce, une offre ou une proposition d'échange ouverte. L'écran liste ce qui bloque, avec un lien vers chaque élément. Les propositions reçues ne bloquent pas : elles échouent d'elles-mêmes à l'acceptation, comme aujourd'hui.
- **Choix des héritières** : au plus `prestige.keepSlots` (20) exemplaires, désignés par leur id, n'importe quelle rareté. Le choix est libre à chaque cycle : une ancienne héritière reprise passe au niveau suivant (plafond 5), une ancienne héritière laissée part avec le reste, une carte choisie pour la première fois passe au niveau 1. Garder les 20 mêmes est possible, mais au plafond elles ne gagnent plus rien (voir Consécration).
- **Ce qui part** : tous les autres exemplaires en `COLLECTION`, supprimés comme au recyclage ; ils quittent les vitrines. Les gravées qui partent doivent être confirmées une à une : le client renvoie la liste des gravées sacrifiées et le serveur la compare à la sienne (`STALE` sinon). Leur numéro disparaît avec elles.
- **Zeni** : valeur de recyclage (`collection.recycleValues`) de chaque exemplaire parti (× `prestige.printing.recycleMultiplier` pour une gravée), puis barème dégressif `prestige.zeniTiers` (par défaut 100 % jusqu'à 200 000, 50 % jusqu'à 500 000, 0 au-delà) et plafond `prestige.zeniCap`. Versés par le grand livre (`CoinReason.REBIRTH`, `refId` = id du `PrestigeCycle`). Le montant affiché dans le récap est revérifié (`STALE`). Ordre de grandeur : une collection tout juste au seuil vaut environ 50 000 Zeni, hors variantes et doublons ; le barème ne joue que pour un très gros stock de doublons.
- **Ce qui reste** : solde de Zeni, stock et crédits de boosters, sachets scellés, pitiés, Encens, capacités achetées à l'atelier (liées au personnage, elles reviennent avec la carte), decks (des ids de `Card` : un deck dont les cartes manquent ne se lance plus, comme aujourd'hui), points de classé, amis, vitrines (vidées de ce qui est parti), liste de souhaits, `Discovery` (le wiki reste dévoilé).
- **Une seule transaction** sous le verrou du joueur, délai de 30 s (le pool coupe une requête à 30 s, `server/pg-adapter.ts`), idempotente. Le verrou est une requête propre (`SELECT prestige, "prestigedAt", "isGuest", "bannedAt", "deletionRequestedAt", "anonymizedAt" … FOR UPDATE`) : `lockPlayers` ne rend ni le prestige ni le gel du compte. Il suffit à figer la collection : toute carte qui arrive chez le joueur prend un verrou de clé étrangère sur sa ligne `User`, incompatible avec `FOR UPDATE`, même sur les chemins qui ne le verrouillent pas eux-mêmes (clôture d'une enchère côté acheteur, envoi de l'équipe) ; les retours en collection (fin de vente, table échue, fin de combat) sont couverts par les blocages et le contrôle final. Idempotence : le client envoie le prestige qu'il voit (`expectedPrestige`), un deuxième envoi trouve un autre nombre et échoue en `STALE`. Dans l'ordre :
  1. contrôles : prestige attendu, compte ni gelé ni banni, blocages lus sans verrou (tout exemplaire dont le statut n'est pas `COLLECTION`, quel qu'il soit), taille de la collection (`prestige.maxCopies` : au-delà, le joueur recycle d'abord ses doublons), seuils, liste des gardées (au plus `keepSlots` ids distincts, possédés, en `COLLECTION`) ;
  2. une seule requête supprime et compte (`WITH gone AS (DELETE … RETURNING …) SELECT …`) : les Zeni correspondent exactement aux exemplaires partis ;
  3. héritage et `keptByOwner` des gardées, provenance, `Discovery.regainedAt` de leurs cartes ;
  4. `PrestigeCycle` (numéro, date, rang global, cartes distinctes possédées, Zeni versés, photo des héritières, meilleur score du cycle), crédit (sauté à 0 Zeni : `credit` refuse un montant nul), `User.prestige` à +1 avec `User.prestigedAt`. Le rang global est pris sous un verrou consultatif (`pg_advisory_xact_lock`) et protégé par un index unique : deux renaissances simultanées n'ont jamais le même ;
  5. contrôle final : il ne reste au joueur que ses gardées, sinon tout est annulé (`STALE`). Une carte mise en vente ou envoyée en expédition au même instant ne peut donc pas échapper à la renaissance.
- **Après la renaissance** :
  - « Nouveau » à l'ouverture devient « Retrouvée » pour une carte déjà découverte que le joueur obtient pour la première fois dans le cycle en cours (`Discovery.regainedAt`, posée dans la même écriture que la découverte) ;
  - la mission `DISCOVER_CARDS` compte, pour un joueur au prestige ≥ 1, les découvertes et les retrouvailles de sa fenêtre (`createdAt` ou `regainedAt`) ;
  - cosmétiques, badges et thèmes de vitrine : tout ce qui était débloqué avant la renaissance le reste. Le meilleur score de chaque cycle est gardé (`PrestigeCycle.stats` : cartes distinctes, par rareté, séries complétées, éditions gravées sanctuaire compris). Les conditions `UNIQUE_CARDS`, `RARITY_OWNED`, `SERIES_COMPLETE`, `SERIES_COMPLETED_COUNT` et `PRINTINGS_OWNED`, et le badge 版, lisent le meilleur entre le cycle en cours et les cycles passés : le joueur garde ce qu'il a gagné, rien de plus. Les conditions de découverte (`CATALOG_DISCOVERED_PERCENT`, `RARITIES_DISCOVERED`) ne bougent pas, `Discovery` restant intacte ;
  - classement des collectionneurs : trié par prestige, puis par cartes distinctes ; un joueur au prestige ≥ 1 y figure même reparti sans carte ;
  - profil : tuile « Cycle III » et record du meilleur cycle, à côté des cartes du cycle en cours.

### Héritage

- **Niveaux** : 1 à 5. La marque se pose sur la fuda sans masquer l'illustration ni le shikishi ; son dessin est arrêté dans les ateliers : un blason en fleur de cerisier au coin haut-droit, un pétale doré par prestige traversé, lisible à toutes les tailles.
- **Changement de main** : enchère, annonce, échange, cadeau et pile ou face déplacent la même ligne `UserCard` (`ownerId` modifié) ; héritage, tirage et numéro suivent donc l'exemplaire. Cela fait huit écritures (une pour l'enchère et le cadeau, deux pour l'annonce, l'échange et le pile ou face), toutes derrière `moveCopy` (`server/collection/transfer.ts`), qui remet `UserCard.keptByOwner` à 0 et écrit une ligne de provenance pour un exemplaire spécial. Deux filets : un test interdit d'écrire `ownerId` ailleurs, et un déclencheur `BEFORE UPDATE OF "ownerId"` remet `keptByOwner` à 0 en base. Sans cela, une héritière gagnée au pile ou face garderait le compteur du perdant et pourrait être consacrée aussitôt.
- **Consécration** : possible quand `heritage ≥ prestige.heritageMax` et `keptByOwner ≥ prestige.consecrateMinOwnCycles` (1). L'héritage s'achète, mais la consécration se mérite : il faut avoir gardé la carte soi-même au moins un prestige. Irréversible, confirmée en maintenant le bouton. L'exemplaire quitte `UserCard` pour `ConsecratedCard` en une seule requête (`WITH moved AS (DELETE … RETURNING …) INSERT … SELECT … FROM moved` ; aucune ligne = refus) : il n'est plus possédé, donc marché, échanges, cadeaux, recyclage, combat, expédition, anti-doublon, complétion et classement l'ignorent sans qu'aucune requête ait à le filtrer. Il reste affiché pour toujours dans le sanctuaire du profil avec son parcours (« gardée du cycle 1 au cycle 5 », propriétaires successifs).

### Éditions gravées numérotées

- **Quand** : seulement pour un joueur au prestige ≥ `prestige.printing.minPrestige` (1), à l'ouverture d'un booster (stock, Zeni, crédit ou sachet scellé), dans `persistDraw`. Les lots, missions, achats en lot et envois de l'équipe n'en donnent jamais.
- **Quelles cartes** : Mythique et au-dessus. `prestige.printing.chanceBp` est réglé par clé de rareté (200, soit 2 %, pour Mythique, BR, AR, VR, Gold, MR et XR) ; une rareté absente du réglage n'est jamais gravée. À 2 %, un joueur en tire environ 3 par cycle.
- **Tirage au sort** : côté serveur, pour chaque carte tirée d'une rareté réglée, `crypto.randomInt(0, 10 000)` contre sa chance.
- **Numéro** : global à la carte et au tirage, tiré au hasard et jamais dans l'ordre. `CardPrinting (cardId, printing)` porte la taille figée à sa création (`prestige.printing.sizes` par rareté, 25 par défaut), le compteur `issued` et `taken`, les numéros déjà sortis. Rien d'autre n'est stocké : aucun ordre futur ne peut fuiter. Le tirage se fait après `drawBoosters`, avec le même générateur injecté (`input.rng`), et ne consomme rien pour un joueur non éligible : les tirages à graine des tests ne bougent pas. Dans la transaction d'ouverture, les cartes à graver triées par id (deux ouvertures qui gravent les deux mêmes cartes ne s'interbloquent pas) :
  1. `INSERT … ON CONFLICT DO NOTHING` du compteur ;
  2. une requête prend un numéro libre au hasard et l'ajoute à `taken` : `UPDATE … SET issued = issued + 1, taken = taken || (SELECT n FROM generate_series(1, size) n WHERE n <> ALL (taken) ORDER BY n OFFSET (r % (size - issued)) LIMIT 1) WHERE issued < size RETURNING taken[issued]`. Aucune ligne rendue = tirage épuisé : la carte sort ordinaire. Un numéro nul est refusé avant l'écriture.

  Le compteur ne redescend jamais, donc un numéro recyclé ou consacré ne ressort pas. Un index unique partiel `(cardId, printing, serial) WHERE printing IS NOT NULL` sert de filet (un index complet couvrirait toute la table `UserCard` pour rien).
- **Tirages successifs** : `prestige.printing.current` (1) est le tirage en cours. L'admin en ouvre un nouveau (saison, événement). Chaque tirage a son sceau (初摺 pour le premier), choisi parmi les kanji de `lib/seal-glyphs.ts` ; changer de tirage ne touche pas aux exemplaires déjà sortis. Le sceau s'affiche toujours à côté du numéro : un deuxième tirage redonne un numéro 12, mais sous un autre sceau.
- **Affichage** : `初摺 17 / 25`, où 25 est la taille figée du tirage.
- **Provenance** : `UserCardOwner` (exemplaire, propriétaire, date, moyen : `DRAW`, `REBIRTH`, `AUCTION`, `LISTING`, `TRADE`, `GIFT`, `CASINO`), écrit pour les seuls exemplaires spéciaux : à la sortie d'une gravée, au premier prestige qui garde un exemplaire et à chaque transfert. Visible sur la fiche de l'exemplaire, les pseudos passant par le masquage des profils privés (`server/collection/public-names.ts`). Un compte supprimé y devient « joueur supprimé » (`ownerId` mis à null).
- **Registre des gravées** : sur la fiche wiki d'une carte, la planche des numéros de chaque tirage (sortis, à toi, consacrés au sanctuaire, recyclés, pas encore sortis), puis en dessous les détenteurs (mêmes règles de confidentialité que la liste des possesseurs, sinon « Un joueur ») et le nombre encore en circulation.
- **Carrousel « En direct »** et **lien de partage d'un tirage** : `NotablePull.printing` et `serial` ; `BoosterOpening.editions` (position, tirage, numéro, taille) pour que `/tirage/[id]` montre la gravée même après sa vente.
- **Recyclage** : jamais dans « Recycler tous les doublons » ni dans le recyclage rapide de la fiche. Une gravée se recycle seule, depuis sa ligne d'exemplaire, avec une confirmation qui rappelle que le numéro disparaît, pour `recycleValues × recycleMultiplier` (5).

### Choisir l'exemplaire qui part

Aujourd'hui le serveur choisit l'exemplaire d'une carte qui part (`pickGiftCopy` : le plus récent hors vitrine), et aucune action ne reçoit l'id d'un exemplaire. Avec des exemplaires différents, ce choix ne doit jamais emporter une pièce spéciale par accident.

- **Choix automatique** : uniquement parmi les exemplaires ordinaires (sans tirage, héritage 0), pour `pickGiftCopy`, `freeCopy`, l'enchère, le cadeau, les annonces, les offres, les échanges, la mise et la relève du pile ou face, et le retrait de cartes par l'admin. Si le joueur n'a que des exemplaires spéciaux de cette carte : erreur `CHOOSE_COPY`, l'écran lui demande lequel.
- **Choix explicite** : champ `userCardId` optionnel sur `createAuctionAction`, `createListingAction`, `makeOfferAction`, `proposeTradeAction`, `acceptTradeAction`, `giftCardAction`, `createCoinFlipAction` et `joinCoinFlipAction`. Le serveur vérifie le propriétaire et le statut sous verrou. Colonne `userCardId` optionnelle sur `TradeListing`, `ListingOffer`, `TradeOffer` et `Trade` pour l'exemplaire désigné pendant l'attente, sans clé étrangère (comme `Gift.userCardId` : la suppression en masse d'une renaissance n'a pas à parcourir ces tables) et revérifiée sous verrou à l'acceptation ; `Auction`, `Gift` et `CoinFlip` l'ont déjà. Les décomptes de disponibilité (création d'une annonce, d'une offre, d'une proposition, relais Discord du Marché) ne comptent que les exemplaires ordinaires, ou l'exemplaire désigné : ils n'annoncent jamais une carte que le serveur refuserait ensuite. Un sélecteur commun (`CopyPicker`) sert à toutes les feuilles.
- **Cartes demandées** (`TradeListingWant`, carte voulue d'un `Trade`, liste de souhaits) : satisfaites par un exemplaire ordinaire, sauf si celui qui donne désigne une pièce spéciale. Demander à un ami un exemplaire précis n'est pas prévu : pour viser un exemplaire, on passe par une vente ou une annonce.
- **Pile ou face** : une pièce spéciale ne se mise que désignée, après un avertissement. La table, le salon, le résultat et le relais Discord affichent l'édition et l'héritage.
- **Combat et expédition** : l'exemplaire est choisi au lancement parmi ceux en `COLLECTION`, ordinaires d'abord ; un spécial peut partir, il revient intact.
- **Vitrine** : à l'inverse, `pickCopies` préfère l'exemplaire spécial, et la ligne d'un exemplaire propose « Exposer cet exemplaire ».
- **Ce que voit l'acheteur** : tuile et page d'enchère, annonce et offre du Marché, feuilles d'échange et de cadeau, messages du bot Discord (`lib/discord/market-message.ts`, `lib/discord/casino-message.ts`) affichent tirage, numéro et héritage de l'exemplaire, pas seulement la carte.

### Affichage

Les versions visuelles sont arrêtées dans des ateliers de maquettes avant d'être codées : trois d'abord (profil et avatar, cartes, rites), puis un quatrième pour ce qui a été revu à la relecture (matière verte de la plaque, nuées d'or, rouleau des cycles, vrai sanctuaire, consécration).

- **`FudaCard`** gagne un champ optionnel `copy?: { heritage, printing, serial, size, seal }`. Sans lui, la fuda est inchangée : toutes les sources actuelles continuent de marcher.
- **Sur la fuda** (`components/fuda/FudaCopy.css` ; `FudaFace.css` est généré par `scripts/fuda-face-css.mjs` et ne s'édite pas à la main) :
  - la gravée ne reçoit que son cartouche vermillon `初摺 17 / 25`, accroché au bord du shikishi en miroir du numéro (le shikishi a une hauteur fixe, sans place pour une ligne de plus), à la feuille d'or pour le n° 1 ; aucun grain ni repère sur l'illustration. Sous 80 px, un coin vermillon ;
  - la marque d'héritage (fleur de cerisier).
- **Sur la fiche** (`CardDetail`) : la mention `初摺 17 / 25` quand la fiche montre un exemplaire gravé. La fiche liste aussi les **exemplaires** : les ordinaires regroupés comme aujourd'hui, chaque spécial sur sa propre ligne (héritage, édition, provenance en fil simple daté, exemplaires en circulation) avec ses actions (vendre, offrir, exposer, consacrer, recycler).
- **Collection** : pastille sur la vignette d'une carte dont on a au moins une gravée ou une héritière ; filtres « Gravées » et « Héritières ».
- **Combat** : `FighterSetup.copy` (optionnel, absent des anciennes parties) garde l'habillage sur le plateau et dans les replays.
- **Images générées** : les fonds et les effets (sanctuaire et sa boucle vidéo, rite d'encre, en-tête de `/prestige`, autels, rouleaux, nuées, poudre d'or, baren…) sont produits par une IA d'après un prompt unique (`prompt-prestige.md`, dossier « prestige background » du poste, comme les vitrines), puis convertis par `npm run prestige:assets` dans `public/prestige/` : WebP, boucles traitées comme celles des vitrines, effets livrés sur fond noir ou blanc rendus transparents. Noms versionnés (`…-v1.webp`), mis en cache une semaine.
- **Textes** : clés `prestige.*`, `fuda.printing`, `fuda.heritage` dans `messages/fr.json` et `messages/en.json` ; espace `prestige` dans `i18n/client-messages.ts`. Kanji des sceaux (転生, 奉納, 初摺…) ajoutés à `lib/seal-glyphs.ts`, puis `npm run fonts:subset` et `npm run fonts:og`.

### Animations

Toutes en `transform` et `opacity`, chargées en import dynamique, passables d'un geste ; avec `prefers-reduced-motion`, un simple fondu. Rien d'animé dans les listes d'avatars ni dans les grilles de cartes.

- **Révélation d'une gravée** (ouverture) : après le grand moment de la rareté, une baren (tampon de l'estampeur) frotte la carte, l'encre apparaît sous son passage, la carte reçoit son cartouche, le numéro s'écrit au pinceau, puis le sceau du tirage se pose. Environ 1,6 s. Le récap marque la carte « Gravée ».
- **Rite de renaissance** (転生), en bain d'encre :
  1. Récap : ce qui part, les Zeni estimés, les gravées sacrifiées à confirmer.
  2. Départ en maintenant le bouton (`components/ui/HoldButton.tsx`, tiré de celui des expéditions).
  3. Les cartes qui partent se replient et s'enfoncent dans une pierre à encre, des ondes s'élargissent ; jamais des milliers de cartes à l'écran : des piles par rareté.
  4. Les 20 héritières restent, et un pétale de plus se dore sur leur fleur de cerisier.
  5. Le chiffre romain est frappé sur l'avatar, et l'emaki du cycle se déroule avec le sceau 転生.
- **Consécration** (montée à l'autel, dans le vrai sanctuaire) : les lanternes s'embrasent, un rayon d'or tombe sur la carte qui s'élève dans son halo, la cloche du sanctuaire sonne, puis la carte prend la place du haut de l'autel à gradins et le sceau 奉納 se pose dans un éclat.
- **Sanctuaire et emakis du profil** : cartes figées (`still`), rouleaux qui se déroulent seulement à l'ouverture ; dans un rouleau ouvert, la procession des héritières défile seule et se fait glisser, comme « Gros tirages » (`useMarquee`).

### Profil

- **Chiffre romain** du prestige (`toRoman`) sur une plaque kikkō (hexagone d'écaille de tortue), en haut du cadre de l'avatar, en miroir du sceau du bas. Matière selon le niveau : laque (I à IV), or (V à XI), émeraude (XII à XVII), nacre (XVIII et plus). Affiché dès le prestige I, avec ou sans cadre, **partout où un avatar apparaît** : plaque complète à partir de 40 px, réduite entre 24 et 39 px, masquée en dessous. Le prestige voyage dans `PlayerDecor` (`lib/profile/decor.ts`, `decorSelect` et `decorColumns` de `server/profile/decor.ts`, `ShownPlayer`), `PlayerAvatar` reçoit une seule prop `decor`, et l'avatar des images de partage (`OgAvatar`) suit. Le décor d'un combat est lu en direct, replays compris : rien n'est figé. Les cinq caches qui gardent le décor changent de version.
- **En-tête** : poudre d'or qui monte derrière l'en-tête dès le prestige I, plus dense à chaque palier ; du V au IX, les nuées porte-bonheur zuiun en laque d'or encadrent l'avatar et le pseudo ; à partir du X, Raigō : des rayons d'or tournent lentement derrière l'avatar sur un banc de nuages lumineux, avec au XVIII le halo de flammes des statues de temple.
- **Bouton « Évoluer »** : rouge (shu), sous « Personnaliser » dans l'action de `ProfileHeader`, sur son propre profil, compte inscrit, quand `prestige.enabled` est actif, que le joueur soit éligible ou non : la page explique ce qui manque.
- **Page `/prestige`** : sceau 転生, « Comment y accéder » (une jauge par rareté : cercles ensō sur téléphone, barres sur ordinateur ; possédées, exigées, seuil ; puis les blocages en cours avec leur lien), « Ce que l'évolution t'apporte », « Ce que tu laisses », puis le parcours en trois temps (choix des 20, récap, confirmation maintenue et rite). Un invité y est invité à créer un compte.
- **Cosmétiques** : conditions `PRESTIGE` (`n`), `CONSECRATED_COUNT` et `PRINTINGS_OWNED` dans `lib/profile/conditions.ts` ; badges dérivés `REBORN` (転), `CONSECRATOR` (奉) et `ENGRAVER` (版) ; cadres `tensei`, `hanga` et `hono` ; couleur de pseudo or, débloquée dès le prestige I et choisie dans « Personnaliser » comme les autres. Un jeu par défaut s'installe depuis l'admin.
- **Emakis** : un rouleau par cycle, couvert de brocart (une couleur par cycle, à tour de rôle) et posé sur une étagère, son titre 巻之三 sur l'étiquette. Il se déroule au toucher : la baguette glisse et découvre le papier, avec la date, le rang global (« 7ᵉ renaissance de Kiraku »), les Zeni, les cartes, puis les 20 héritières de ce cycle en procession qui défile comme « Gros tirages ». Les cartes qu'on n'a pas gardées restent dans l'histoire du profil.
- **Sanctuaire** : un vrai sanctuaire (hall d'un sanctuaire shinto la nuit, image générée et sa boucle vidéo, affichés comme les fonds des vitrines), un autel à gradins (1, 3 puis 5 places) avec les 9 dernières cartes consacrées, la dernière en haut, chacune dans un halo de nacre ; au-delà, le trésor du sanctuaire, sous la scène. Toucher une carte montre son parcours (cycles traversés, propriétaires successifs) en fil simple.
- Le tout suit `profileVisibility`.

### Admin (`/admin/prestige`)

- **Réglages**, tous dans `GameSetting` :

  | Clé | Défaut |
  | --- | --- |
  | `prestige.enabled` | non (aussi sur `/admin/fonctionnalites`) |
  | `prestige.requiredPercent` | seuils par rareté ci-dessus |
  | `prestige.keepSlots` | 20 |
  | `prestige.minDaysBetween` | 0 |
  | `prestige.maxCopies` | 100 000 exemplaires au plus dans la collection au moment de renaître |
  | `prestige.heritageMax` | 5 (5 au plus : il n'existe que cinq marques) |
  | `prestige.consecrateMinOwnCycles` | 1 |
  | `prestige.zeniTiers`, `prestige.zeniCap` | 100 % jusqu'à 200 000, 50 % jusqu'à 500 000 ; plafond 500 000 |
  | `prestige.printing.minPrestige` | 1 |
  | `prestige.printing.chanceBp` | 200 pour Mythique, BR, AR, VR, Gold, MR, XR |
  | `prestige.printing.sizes` | 25 |
  | `prestige.printing.current`, `prestige.printing.seals` | 1, `{ 1: "初摺" }` |
  | `prestige.printing.recycleMultiplier` | 5 |
  | `discord.prestigeEnabled` | non |

- **Aperçu d'équilibrage**, calculé à la demande et mis en cache (il parcourt toute la table `UserCard`) : cartes exigées par rareté, joueurs éligibles et presque éligibles.
- Ouvrir un nouveau tirage (`AdminLog`) ; compteurs par carte (sortis, épuisés) ; liste des renaissances et des consécrations ; installation des cosmétiques de prestige.
- Sur la fiche joueur : prestige, héritières, gravées.
- Pas d'attribution manuelle de gravée ni de numéro : la rareté ne se fabrique pas depuis l'admin.

### Annonces Discord

Une renaissance et une gravée tirée sont annoncées dans le salon `DISCORD_PRESTIGE_CHANNEL_ID`, si `discord.prestigeEnabled` est allumé. Sur le modèle du casino : textes purs dans `lib/discord/prestige-message.ts`, mise en file et publication par le cron de la minute, jamais dans la transaction de jeu ; le pseudo d'un profil privé est masqué. Voir `docs/DISCORD.md`.

### Données

```prisma
model User {
  // …
  prestige    Int       @default(0) // CHECK >= 0
  prestigedAt DateTime? // dernière renaissance
  cycles      PrestigeCycle[]
}

model UserCard {
  // …
  heritage    Int  @default(0) // CHECK entre 0 et 5
  keptByOwner Int  @default(0) // prestiges traversés chez le propriétaire actuel (remis à 0 au transfert)
  printing    Int? // tirage de l'édition gravée (null = exemplaire ordinaire)
  serial      Int? // numéro dans ce tirage ; CHECK : renseigné avec printing, tous deux ≥ 1
  owners      UserCardOwner[]

  // Dans la migration : index unique partiel (cardId, printing, serial) WHERE printing IS NOT NULL,
  // index partiel (ownerId, cardId) des exemplaires spéciaux, déclencheur qui remet keptByOwner à 0
  // quand ownerId change, CHECK keptByOwner = 0 OR heritage > 0
}

enum OwnershipVia { DRAW REBIRTH AUCTION LISTING TRADE GIFT CASINO }

model UserCardOwner {
  id         String       @id @default(cuid())
  userCardId String       // onDelete: Cascade (exemplaire recyclé = provenance effacée)
  ownerId    String?      // onDelete: SetNull (compte supprimé)
  via        OwnershipVia
  at         DateTime     @default(now())
  @@index([userCardId, at])
  @@index([ownerId]) // suppression d'un compte
}

// Sanctuaire : exemplaire sorti du jeu, figé pour toujours
model ConsecratedCard {
  id            String   @id // ancien id de l'exemplaire
  userId        String   // onDelete: Cascade
  cardId        String
  heritage      Int
  printing      Int?
  serial        Int?
  size          Int?
  journey       Json     // cycles traversés et propriétaires successifs
  consecratedAt DateTime @default(now())
  @@unique([cardId, printing, serial])
  @@index([userId, consecratedAt])
}

// Compteur de numéros d'une carte dans un tirage ; la taille est figée à la création
model CardPrinting {
  cardId   String
  printing Int
  size     Int
  issued   Int   @default(0) // CHECK 0 <= issued <= size
  taken    Int[] // numéros déjà sortis, dans l'ordre de sortie ; CHECK cardinality(taken) = issued
  @@id([cardId, printing])
}

model PrestigeCycle {
  id          String   @id @default(cuid())
  userId      String   // onDelete: Cascade
  number      Int // prestige atteint (1, 2…)
  globalRank  Int      @unique // n-ième renaissance de Kiraku
  uniqueCards Int // cartes distinctes possédées au départ
  zeni        Int
  heirs       Json // [{ userCardId, cardId, heritage, printing, serial }] : photo, comme Expedition.snapshot
  stats       Json // meilleur score du cycle : cartes distinctes, par rareté, séries complétées, éditions gravées
  createdAt   DateTime @default(now())
  @@unique([userId, number])
}

model Discovery {
  // …
  regainedAt DateTime? // première obtention dans le cycle en cours (prestige ≥ 1)
  @@index([userId, regainedAt])
}
```

S'y ajoutent `CoinReason.REBIRTH` (le mot PRESTIGE désigne déjà un type de booster, `BoosterKind.PRESTIGE`), des CHECK sur `User` (`prestige ≥ 0`, nul exactement quand `prestigedAt` est vide), `userCardId` optionnel sur `TradeListing`, `ListingOffer`, `TradeOffer` et `Trade`, `printing` et `serial` sur `NotablePull`, `editions` sur `BoosterOpening`. Pas de statut `SANCTUARY`. Migrations nommées, écrites à la main : `prestige_copies`, `prestige_cycles`, `prestige_printings`, `prestige_sanctuary`.

### Sécurité et tests

- Le serveur décide de tout : tirage d'une gravée et de son numéro, exemplaires qui partent, Zeni versés. Le client n'envoie que des ids d'exemplaires et des confirmations.
- Chaque action (`prestige`, `consecrate`, choix d'exemplaire, recyclage d'un exemplaire) : session → Zod (`keep` : au plus `keepSlots` ids distincts) → propriété et statut sous verrou → rate limit.
- Tests Vitest (logique pure dans `lib/prestige/`) : seuils par rareté, barème dégressif, montée d'héritage, règle de consécration, `toRoman`, tirage d'une gravée, mélange des numéros (chaque numéro une fois, ordre différent de 1, 2, 3…), choix automatique de l'exemplaire.
- Migrations rejouées en PGlite, sur le modèle de `server/casino/migration.test.ts` : index unique partiel, chaque CHECK, déclencheur, cascades, et la requête du numéro (un tirage de taille n rend exactement 1 à n, puis plus rien).
- Tests base (`server/prestige/prestige.db.test.ts`, sautés sans `DATABASE_URL_TEST`) :
  - double renaissance simultanée : une seule passe ; dix renaissances simultanées : dix rangs distincts et sans trou ;
  - renaissance contre chaque chemin qui déplace une carte (clôture d'enchère côté acheteur, table de casino échue, fin de combat, cadeau) : aucune carte perdue sans être payée, aucun interblocage ;
  - 50 ouvertures simultanées sur un tirage auquel il reste 3 numéros : exactement 3 gravées, numéros distincts ; deux ouvertures qui gravent les mêmes cartes dans l'ordre inverse : pas d'interblocage ; vingt premières gravures d'une carte : un seul compteur ;
  - un paiement qui échoue après la gravure laisse le compteur intact ;
  - soldes = journal après une renaissance ;
  - une gravée ne part jamais par le choix automatique, casino compris ;
  - chacun des huit transferts : héritage et numéro gardés, `keptByOwner` à 0, provenance écrite ;
  - consécration contre un cadeau simultané du même exemplaire ; suppression, anonymisation et purge des invités avec des données de prestige.
- RGPD : l'export ajoute `prestige` (cycles, héritières, cartes consacrées, provenance des exemplaires possédés) ; l'anonymisation met à null le propriétaire dans `UserCardOwner`.
- Code : règles pures dans `lib/prestige/`, écritures dans `server/prestige/prestige-core.ts` (client injecté), lectures dans `server/prestige/queries.ts`, actions dans `server/actions/prestige.ts` et `admin-prestige.ts`, écran dans `components/prestige/`.

## Wrapped de l'année

Récap personnel de l'année, ouvert en décembre : boosters ouverts (dorés, divins), plus gros tirage, cartes tirées et découvertes, Zeni gagnés et dépensés (séquestres rendus neutralisés), combats et meilleur rang en classé, carte préférée (la plus alignée en combat, sinon la vitrine, sinon le plus gros tirage). Il se termine par une image story 1080 × 1920 à partager (bouton natif du téléphone, sinon téléchargement).

- **Livré éteint** : `wrapped.enabled`, `wrapped.year`, `wrapped.opensAt` et `wrapped.closesAt` se règlent dans `/admin/wrapped`, qui montre aussi un aperçu du diaporama et de l'image pour n'importe quel pseudo, même éteint.
- Pendant la période : page `/wrapped` (diaporama plein écran), bannière de l'accueil (masquable) et bouton sur son propre profil, pour qui a ouvert au moins un booster dans l'année.
- Aucune table : tout se lit dans `BoosterOpening`, `CoinTransaction`, `Battle`, `Discovery` et la vitrine (`server/wrapped/read.ts`, testé sur le vrai schéma), gardé une heure par joueur. L'image est privée (le joueur connecté, ou l'admin pour l'aperçu) et ne montre jamais l'illustration d'une carte spoil.

## Panneau d'administration

`/admin` permet à un compte `role = ADMIN` de tout gérer sans redéployer. Pour ça, aucune règle du jeu ne vit dans des constantes : délais, taux, stats de combat et barème du classé se lisent dans la table `GameSetting`, et les constantes du code ne servent que de valeurs par défaut.

| Module | Ce que l'admin peut faire |
| --- | --- |
| Tableau de bord | Joueurs actifs, boosters ouverts, Zeni en circulation, ventes et combats du jour |
| Utilisateurs | Rechercher, voir collection et journal de Zeni, changer pseudo ou rôle, donner/retirer Zeni, cartes ou boosters, remettre à zéro pitié ou PC, bannir/débannir, anonymiser (RGPD) |
| Catalogue | Lancer l'import AniList, modifier rareté, stats ou image d'une carte, la retirer des boosters, la marquer Spoil (voir « Mode spoiler ») |
| Boosters | Délai (10 min), stock max (10), cartes par booster (4), taux par rareté, seuil de pitié (250), Zeni de départ (500) |
| Lots | Créer des lots (Zeni + boosters + cartes précises ou tirées dans une rareté), les lier aux missions, au parrainage ou aux fins de saison, les envoyer à un joueur ou à tous |
| Quêtes | Créer, modifier, activer ou désactiver les missions quotidiennes et hebdomadaires : objectif, période, lot |
| Combat | Taille d'équipe (3), multiplicateurs de type (×1,25), critique (10 %, ×1,5), tours max (50), combats récompensés par jour (10), decks par joueur (10), bonus de synergie d'univers (+10 %) |
| Univers | `/admin/univers` : regrouper les séries d'une même œuvre (JJK, JJK Manga, JJK Modulo), fusionner, retirer ; pré-rempli par `npm run catalog:universes` |
| Classé | Seuils et barème de chaque rang, critère d'écrasante (60 %), protection après montée, durée et reset de saison, ouvrir/clôturer une saison, lots de fin de saison |
| Marché | Annuler une vente, taxe (5 %), durées autorisées, ventes simultanées max, délai pour les nouveaux comptes |
| Modération | Avis et bugs, joueurs signalés, journal des actions admin |

| Module ajouté | Ce que l'admin peut faire |
| --- | --- |
| Discord | Activer ou désactiver le modal « Rejoins le serveur », changer le lien d'invitation, le titre, le texte, le déclencheur et la fréquence ; section Discord de la page Social (`discord.socialPromo` : interrupteur, lien, textes fr/en, début et fin d'affichage facultatifs) |
| Fonctionnalités | Interrupteurs : casino (visible ou caché), boutique, paiement Stripe, classé, marché, cadeaux |
| Casino | `/admin/casino` : date d'ouverture, badge et cérémonie, garde-fous et raretés du pile ou face, santé du séquestre, statistiques, retrait motivé d'une table (voir « Casino ») |
| Vitrines | `/admin/vitrines` : vitrines par joueur, et pour chaque thème son statut (Disponible, Arrive prochainement : visible flouté avec un cadenas, Masqué), sa condition de déblocage et le nombre de vitrines qui l'utilisent |
| Fresques | `/admin/fresques` : chute (interrupteur, chance par booster), fresques (image découpée, lots, boosters, spoiler, aperçu en direct), publication et archivage (voir « Fresques 絵 ») ; admin seulement |
| Event vitrines | `/admin/evenement/vitrines` : allumer ou cacher l'event, édition, dates, minimum de cartes, vitrines par page, inscriptions et votes en direct, retrait d'une inscription (voir « Event vitrines ») |
| Boutique | Articles (boosters, packs, bannières), prix en Zeni, prix en euros et id de prix Stripe, dates de disponibilité |
| Boosters spéciaux | Bannières vedettes (cartes mises en avant, pitié vedette à 100, prix, dates), fréquence du doré (tous les 10), chance du divin (1/2 000) |
| Avis | Masquer, épingler sur l'accueil, répondre |

Trois modules de plus pour la conformité : **Pages légales** (éditer chaque page en français et en anglais, publier une nouvelle version, forcer la réacceptation des CGU), **Données personnelles** (traiter les demandes d'export et de suppression, avec historique) et **Traductions** (compléter les champs anglais du contenu et repérer ceux qui manquent).

Mise en place :

- **Accès** : `middleware.ts` redirige `/admin/*` si la session n'est pas admin, et chaque Server Action admin appelle `requireAdmin()`. Ne te fie jamais à un bouton masqué. Le premier admin est désigné par son id Discord dans une variable d'environnement.
- **Rôle DEV** (contributeurs qui ajoutent des personnages) : donné ou retiré par un admin depuis la fiche joueur. Il n'ouvre que le catalogue (`requireStaff()` / `getStaff()`, périmètre `drafts`) : créer, modifier ou supprimer une carte **en brouillon jamais distribuée** (ni exemplaire ni découverte), envoyer des images. Publier, archiver, restaurer, actions groupées, raretés, propriétaires d'une carte et tous les autres modules restent à l'admin (404 sur les pages, `FORBIDDEN` dans les actions). Le cœur du catalogue revérifie le périmètre sous le verrou (`lib/admin/roles.ts`). Un brouillon n'entre dans aucun tirage : l'admin relit puis publie.
- **Réglages** : une ligne `GameSetting` par clé (`booster.intervalMinutes`, `ranked.tiers`…), validée par un schéma Zod propre à la clé avant écriture. Le jeu les lit via `unstable_cache` tagué `settings`, et chaque sauvegarde appelle `revalidateTag("settings")` : effet immédiat sans redéployer.
- **Traçabilité** : chaque action écrit une ligne `AdminLog` (qui, quoi, avant, après). Les dons de Zeni passent aussi par `CoinTransaction` avec la raison `ADMIN`, pour que le journal de l'économie reste juste.
- **Sécurité** : confirmation pour les actions irréversibles, aperçu de l'impact avant de changer un taux (« 1,4 Mythique par jour → … »), et suppression d'un joueur = anonymisation, pas effacement des transactions.
- **Interface** : pensée pour le desktop (tableaux denses, filtres, actions en lot) mais utilisable au téléphone : sous 768 px, chaque ligne de tableau devient une carte empilée avec ses actions dans un menu.

## Pages légales, RGPD et langues

Cinq pages publiques, liées depuis le pied de page et depuis l'inscription, couvrent les obligations d'un site français qui traite des comptes joueurs. Leur texte est éditable dans l'admin, en français et en anglais. Je ne suis pas juriste : fais relire ces textes avant l'ouverture publique.

| Page | Route | Contenu minimum |
| --- | --- | --- |
| Mentions légales | `/mentions-legales` | Éditeur (un particulier peut rester anonyme s'il a donné son identité à l'hébergeur), contact, directeur de publication, hébergeur (Vercel) et adresse |
| Politique de confidentialité | `/confidentialite` | Responsable du traitement, données collectées (pseudo, e-mail, avatar et id Discord, adresse IP, journaux), finalités et base légale de chacune, durées de conservation, sous-traitants (Vercel, Supabase, Resend, Ably, Discord, Stripe plus tard), transferts hors UE, droits et comment les exercer, réclamation à la CNIL |
| Politique cookies | `/cookies` | Liste des cookies et stockages locaux, rôle, durée, et lien pour modifier son choix |
| Conditions d'utilisation | `/cgu` | Compte (un par personne), règles de jeu, Zeni et cartes sans valeur monétaire, sanctions et contestation, propriété des personnages, responsabilité |
| Conditions de vente | `/cgv` | Seulement quand Stripe sera branché : prix, paiement, renonciation au droit de rétractation pour un contenu numérique livré immédiatement, remboursements |

Droits des joueurs, dans un onglet « Mes données » du Compte :

- **Télécharger mes données** : un fichier JSON avec le profil, les cartes, le journal de Zeni, les combats et les avis (droit d'accès et de portabilité).
- **Modifier** pseudo, langue et préférences (droit de rectification).
- **Supprimer mon compte** : anonymisation sous 30 jours (pseudo remplacé, e-mail et id Discord effacés), les transactions restent pour l'intégrité de l'économie mais ne pointent plus vers une personne.
- **Gérer les cookies** : rouvre le bandeau.

Cookies : au départ, n'utilise que ce qui est strictement nécessaire (cookie de session, protection anti-abus) et du stockage local pour la langue et le son. Ces usages sont exemptés de consentement, donc pas de bandeau à afficher, juste la page d'information. Dès que tu ajoutes de la mesure d'audience non exemptée, de la pub ou des intégrations tierces qui déposent des traceurs, il faut un bandeau : « Accepter » et « Refuser » aussi visibles l'un que l'autre, un choix « Personnaliser », rien de déposé avant le choix, et le choix redemandé au bout de 6 mois.

Âge : en France, un mineur de moins de 15 ans a besoin de l'accord d'un parent pour ce type de service. **Décision de l'étape 10 : pas de contrôle d'âge technique.** Les CGU portent une clause déclarative (15 ans ou accord d'un parent) ; `User.birthDate` reste en base, inutilisé. Revu pour le casino le 16 novembre 2026 : sans Zeni ni argent réel, seulement des cartes virtuelles entre joueurs, **toujours pas de contrôle d'âge** ; une mention « Tout est virtuel » et une clause des CGU. À revoir avant tout achat en argent réel (18 ans).

Acceptation des CGU : chaque page légale porte un numéro de version. Le joueur accepte la version en cours à l'inscription ; si tu changes les CGU, il voit un écran d'acceptation à sa prochaine visite (`User.termsVersion`).

### Mise en œuvre (étape 10)

- **Pages légales versionnées** (`LegalPage`) : `/mentions-legales`, `/confidentialite`, `/cookies`, `/cgu`, rendues avec `react-markdown` sans HTML brut (liens https, mailto et internes seulement), anciennes versions via `?v=N`. Textes v1 à compléter dans `prisma/seed/legal/*.md` (repères `[[…]]`), publiés par `npm run seed:legal` (aussi dans `vercel-build`, seulement si la table est vide). `/admin/legal` : brouillon fr/en, aperçu, publication, réacceptation forcée des CGU (`legal.termsRequiredVersion`).
- **CGU** : case obligatoire à l'inscription e-mail ; `AccountGate` (layout) montre l'écran d'acceptation à tout compte inscrit en retard de version, Discord compris. Les invités voient une mention dans le pied de page.
- **Mes données** (`/compte/donnees`) : export JSON (`POST /api/me/export`, liste blanche de champs, `account.exportsPerDay`), changement de pseudo (`account.usernameChangeDays`), langue mémorisée, suppression annulable (`account.deletionGraceDays`, compte gelé), anonymisation par `/api/cron/accounts` ou depuis `/admin/donnees`. Historique dans `DataRequest`.
- **Cookies** : registre unique `lib/consent/registry.ts` (page Cookies générée depuis lui) ; bandeau CNIL prêt mais masqué tant que tout est exempté ; « Gérer les cookies » en pied de page.
- **Discord** : `discord.joinModal` (désactivé par défaut), `/admin/discord`. **Casino** : `features.casino` (visible ou caché), `casino.*` dans `/admin/casino`. `/admin/fonctionnalites` réunit les interrupteurs.
- **PWA** : service worker à chaque visite, page hors ligne (aucun cache de données), raccourcis, bouton « Installer l'app ».
- **Admin** : tableau de bord, journal `AdminLog` (`writeAdminLog` partout), envoi de lots à un joueur ou à tous (`LotGrant`, `LotBroadcast`, notification `LOT_GRANTED`), `/admin/general`, tableaux responsives.
- **Sécurité** : `npm run audit:actions` (session, Zod, rate limit sur chaque Server Action), pseudos masqués selon la visibilité du profil sur `/tirage` et le marché, CI GitHub Actions. **Performance** : messages admin hors du bundle des joueurs, `domMax` chargé à la demande, squelettes `loading.tsx`, Speed Insights, `npm run lighthouse` (375 px).

### Français et anglais

Utilise **next-intl**, qui s'intègre à l'App Router et aux Server Components.

- **Routes** : français par défaut sans préfixe (`/boosters`), anglais sous `/en` (`/en/boosters`). Les deux versions sont indexables, avec `hreflang` dans les métadonnées.
- **Choix de la langue** : détecté depuis `Accept-Language` à la première visite, puis mémorisé dans un cookie de préférence et dans `User.locale`. Sélecteur Français / English dans le pied de page (comme Kyara) et dans le Compte.
- **Textes de l'interface** : `messages/fr.json` et `messages/en.json`, rangés par écran (`boosters.open`, `market.bid`…). Écris toutes les chaînes via `t()` dès la première ligne de code : c'est beaucoup plus coûteux à reprendre ensuite.
- **Contenu de l'admin** : missions, articles de boutique, bannières, modal Discord et pages légales ont un champ par langue (`{ "fr": "…", "en": "…" }`), avec repli sur le français si l'anglais est vide.
- **Cartes** : le nom AniList (`name.full`) est le même dans les deux langues ; pour les séries, importe aussi `title { english }` et affiche-le en anglais quand il existe.
- **Formats** : dates, nombres et prix via les formateurs de next-intl (« 1 400 Zeni » / « 1,400 Zeni », « il y a 3 min » / « 3 min ago »).
- **Raretés et rangs** : noms traduits (Commune → Common, Mythique → Mythic, Argent → Silver, Émeraude → Emerald, Grand Champion inchangé), lettres de rareté conservées (C, U, R, E, L, M).

```ts
// i18n/routing.ts
import { defineRouting } from "next-intl/routing";
export const routing = defineRouting({
  locales: ["fr", "en"],
  defaultLocale: "fr",
  localePrefix: "as-needed", // /boosters en français, /en/boosters en anglais
});
```

## Performance, sécurité et points légaux

Les trois risques réels sont la duplication de cartes ou de Zeni (concurrence), les multicomptes qui farment des boosters pour un compte principal, et les droits sur les personnages.

Performance :

- Un seul `PrismaClient` partagé (singleton dans `lib/prisma.ts`), branché sur `@prisma/adapter-pg` et l'URL poolée (mode transaction).
- Pages en Server Components ; seuls les éléments interactifs (ouverture, enchère, timer) sont des Client Components.
- Catalogue et pages de cartes en cache (`revalidateTag` à l'ajout de cartes).
- Images de cartes en WebP, deux tailles (vignette \~300 px, détail \~800 px), via CDN.
- Pagination par curseur partout (marché, historique) ; la collection, bornée par la taille du catalogue, pagine par décalage.

Consommation Vercel (plan Hobby : 1 M d'invocations, 4 h de CPU actif, 1 M de requêtes CDN, 10 Go de transfert d'origine sur 30 jours ; dépassées en octobre 2026, projet mis en pause) :

- Une seule connexion Ably par onglet (`components/realtime/RealtimeProvider.tsx`), ouverte seulement quand le joueur est là. Cloche, chat, file d'attente, salon et combat arrivent en direct ; les sondages ne sont que des secours (`realtime.safetyPollSeconds`, `battle.safetyPollSeconds`).
- Tous les sondages passent par `usePoll` (`lib/realtime/schedule.ts`) : rien onglet caché ni après `activity.idleSeconds` sans geste, délai doublé sans nouveauté jusqu'à `activity.backoffMax`, reprise immédiate au retour. La cloche et la pastille du chat partagent un seul appel.
- Pas de prefetch sur la navigation persistante (en-tête, barres, ruban des tirages) : chaque prefetch d'une page dynamique est une invocation. Les comptes à rebours qui rafraîchissent la page attendent que l'onglet soit visible ; le stock de l'en-tête avance seul côté client.
- Le fil des gros tirages est un seul résultat en cache pour tout le monde (`home.pullFeed.cacheSeconds`).
- Robots : `app/robots.ts` refuse les robots d'IA (`lib/seo/robots.ts`) et les variantes à paramètres (filtres du wiki, versions légales). Dans le tableau de bord Vercel, Firewall → Rules : règle managée « AI Bots » en Deny, et Bot Protection en Log puis Challenge.
- `/api/health` interroge la base : un outil de surveillance doit l'appeler au plus toutes les 10 minutes (une par minute = 43 000 invocations par mois). Vérifier dans Vercel → Logs, filtre `/api/health`.
- L'estimation par joueur actif et par écran est dans `/admin/general` (« Consommation Vercel estimée »), à relire avant de baisser un délai de sondage.
- Depuis le passage en Vercel Pro (20 $ de crédit par mois, plus de quota fixe), les anciennes limites Hobby sont un budget mensuel réglable (`usage.vercelBudget`).
- `/admin/general` mesure aussi Supabase en SQL (taille de la base, tables les plus lourdes, connexions, stockage) ; l'egress, illisible en SQL, est estimé. Limites du plan dans `usage.supabaseLimits`.
- Bandeau en haut de tout `/admin` dès qu'une mesure dépasse `usage.alertThresholds` (70 % orange, 90 % rouge par défaut). Mesures en cache 5 min, tolérantes : une requête qui échoue s'affiche « indisponible ».
- Comptes invités abandonnés supprimés chaque nuit par le cron des comptes (`server/account/guest-purge.ts`) : créés il y a plus de `guest.retentionDays` jours (7 par défaut, 0 = jamais) et sans session prolongée, tirage ni mouvement de Zeni depuis. Un bandeau prévient l'invité.
- Aucun service tiers ne bloque le jeu : rate limit en base avec repli en mémoire, e-mails et temps réel jamais bloquants (journalisés), sondages de secours quand Ably est coupé ou refuse un canal.

Sécurité et anti-triche :

- Tout tirage, prix, solde et résultat de combat est calculé côté serveur ; le client n'envoie que des ids.
- Toute opération sur les Zeni ou les cartes passe par une transaction avec `FOR UPDATE` ou un `updateMany` conditionnel.
- Chaque Server Action : session vérifiée, entrées validées avec Zod, rate limit.
- Anti-multicomptes : connexion OAuth (Discord/Google) uniquement, enchères bloquées 48 h après inscription, taxe de 5 % sur les ventes.

Points légaux à garder en tête (je ne suis pas juriste) :

- Les personnages et visuels d'anime appartiennent à leurs ayants droit. Un projet de fan gratuit est en général toléré mais peut recevoir une demande de retrait ; évite de monétiser et d'utiliser des visuels officiels sans autorisation (fan art avec accord de l'artiste, ou illustrations originales).
- **Argent réel (Stripe, plus tard)** : vendre des boosters aléatoires contre de l'argent fait entrer l'appli dans les règles sur les loot boxes (interdites en Belgique, encadrées ailleurs), et transforme l'usage de personnages sous droits en exploitation commerciale. Stripe interdit aussi les jeux de hasard, casinos compris, et les produits qui portent atteinte à la propriété intellectuelle : un compte peut être bloqué à la première revue. Avant de brancher Stripe : taux affichés avant chaque achat, Zeni non reconvertibles en argent, aucune revente de cartes contre de l'argent, et un avis juridique. Le casino ne doit jamais accepter de Zeni achetés en argent réel ni rien rendre qui en ait la valeur.
- RGPD : un compte supprimable, une page de confidentialité, et rien d'autre que pseudo, e-mail et avatar en données personnelles.

## Sécurité applicative

Aucune donnée envoyée par un joueur n'est jamais exécutée, ni comme SQL, ni comme HTML, ni comme script. Chaque règle ci-dessous est une case à cocher de revue avant chaque mise en ligne.

| Menace | Protection dans Kiraku |
| --- | --- |
| Injection SQL | Prisma uniquement ; le SQL brut passe par `$queryRaw` en template balisé (paramètres liés). `$queryRawUnsafe` et `$executeRawUnsafe` sont interdits (règle ESLint). |
| XSS (script injecté) | React échappe tout texte. `dangerouslySetInnerHTML` est interdit, sauf pour les pages légales rendues avec `react-markdown` sans HTML brut. Les liens n'acceptent que `https:` (jamais `javascript:`). |
| Champs de formulaire | Chaque Server Action et route valide ses entrées avec Zod : types, longueurs max, listes fermées (`enum`), entiers bornés pour les prix. Pseudo : `^[A-Za-z0-9_-]{3,20}$`. Avis et bugs : 1 000 caractères max, texte brut. |
| Données trop larges (mass assignment) | On ne passe jamais `formData` ou un objet client entier à Prisma : chaque champ écrit est choisi à la main. |
| Accès aux données d'un autre (IDOR) | Chaque action vérifie la session puis la propriété : « cette carte, cette vente, ce combat est-il à moi ? », dans la même requête que l'écriture. |
| CSRF | Les Server Actions de Next.js refusent les requêtes d'une autre origine ; les routes API acceptent seulement `POST` avec vérification de l'en-tête `Origin`. Cookies de session `httpOnly`, `secure`, `sameSite=lax`. |
| En-têtes HTTP | Content-Security-Policy stricte avec nonce (scripts du site seulement, images AniList et Discord autorisées), HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` minimale, `frame-ancestors 'none'`. |
| Redirections | Les `callbackUrl` d'Auth.js et tout paramètre de redirection sont limités à des chemins internes. |
| Contenu de l'admin | Le lien Discord n'accepte que `https://discord.gg/…` ou `https://discord.com/invite/…` ; les URL d'images que les domaines listés dans `next.config` (`remotePatterns`). |
| Abus et robots | Rate limit en base (repli en mémoire si la base ne répond pas) sur l'ouverture, les enchères, les défis, l'inscription et les formulaires ; protection anti-robots et pare-feu Vercel. |
| Comptes en série, ban contourné | Détection des multi-comptes (IP et appareil relevés) et bans réseau : une IP ou un appareil banni coupe tout l'accès, l'équipe exceptée (voir « Multi-comptes et bans réseau »). |
| Secrets | Variables d'environnement côté serveur uniquement (jamais `NEXT_PUBLIC_`), modules marqués `server-only`, messages d'erreur génériques côté client, détails dans les logs. |
| Dépendances | `npm audit` en CI, Dependabot ou Renovate, versions verrouillées. |

Pour l'admin : rôle vérifié côté serveur à chaque action, session courte, journal `AdminLog` de toutes les écritures, et confirmation pour les actions irréversibles.

## Multi-comptes et bans réseau

Bannir un compte ne suffisait pas : ses sessions fermées, le navigateur recréait aussitôt un invité. La détection des multi-comptes relève l'IP et un identifiant d'appareil (cookie `kiraku.device`) de chaque joueur (`UserSignal`, `/admin/multi-comptes`) ; les bans réseau s'appuient sur ces relevés.

**Ce qui est bloqué.** Depuis une IP ou un appareil banni (`NetworkBan`), personne ne joue plus, même déjà connecté. Seule l'équipe (ADMIN, DEV) passe.

- Une IPv4 se bannit à l'adresse exacte, une IPv6 par son préfixe /64, une IPv4 encapsulée (`::ffff:a.b.c.d`) comme une IPv4 (`lib/anticheat/network.ts`).
- Pages : l'écran « Accès bloqué » (sceau 禁) remplace la page (`AccountGate`), sauf les textes légaux et `/connexion`, pour qu'un membre de l'équipe déconnecté puisse revenir.
- Actions et routes : `getCurrentUser` traite le joueur comme banni (`bannedAt` à la date du ban), toutes les vérifications existantes s'appliquent.
- Entrées sans session refusées : invité automatique, inscription et connexion par e-mail, connexion et liaison Discord (callback `signIn`).
- Une lecture de la table qui échoue laisse passer (journalisée) : un incident sur les bans ne ferme pas le site.

**Durée.** Un ban posé par un admin est définitif jusqu'à sa levée, qui supprime la ligne (le journal admin ne garde que la valeur masquée). Lever un appareil lève les IP qu'il a fait bannir.

**Le ban suit l'appareil.** Un appareil banni qui revient d'une IP qui ne l'est pas la fait bannir (source `AUTO`, `multiAccount.autoBanDays` jours, 30 par défaut), sauf si :

- le suivi est coupé (`multiAccount.followDevice`) ou l'IP n'est pas publique ;
- un compte de l'équipe l'a utilisée ;
- plus de `multiAccount.autoBanMaxOthers` autres comptes actifs l'ont utilisée (0 par défaut ; ceux déjà vus sur l'appareil banni ne comptent pas) ;
- l'appareil a déjà fait bannir `multiAccount.autoBanPerDevice` IP (5 par défaut).

L'expiration et le plafond évitent qu'un banni fasse bannir exprès le wifi d'un café ou d'un lycée. L'admin peut rendre définitif un ban automatique ; le cron des comptes efface les expirés.

**Garde-fous à la pose.** Jamais une IP ou un appareil utilisé par l'équipe, une adresse privée, locale ou réservée (signe d'un proxy mal réglé), ni une IP vue sur plus de `multiAccount.sharedIpCap` comptes (réseau public ou d'opérateur). Une IP partagée avec d'autres comptes actifs se bannit depuis la fiche joueur, décochée par défaut et avec les comptes coupés nommés ; un ban de groupe la saute. Un compte de l'équipe ne se bannit pas.

**Admin.** Fiche joueur (bloc « Bannir le réseau » : IP et appareils précochés s'ils ne coupent personne d'autre, avec ou sans le compte), groupe suspect de `/admin/multi-comptes` (« Bannir ce groupe », 20 comptes au plus), liste `/admin/multi-comptes/bans` (origine, accès bloqués, lever, rendre définitif). Écritures dans `server/anticheat/network-ban-core.ts`, sous verrou, admin revérifié ; le DEV voit tout en lecture seule, IP masquées.

**RGPD.** IP et identifiant d'appareil gardés 90 jours après la dernière visite (`multiAccount.retentionDays`), et tant que dure un ban, même après la suppression du compte (intérêt légitime : un ban ne doit pas se contourner en supprimant son compte). L'export des données inclut les bans venus du compte, sans la raison ni l'admin. Le cookie d'appareil figure dans le registre des cookies (rôle « sécurité »).


## Import Kyara

Beaucoup de joueurs viennent de Kyara et veulent retrouver leurs cartes. Un import unique, comme Kizuna, mais outillé.

**Pourquoi l'équipe lit la collection.** L'API de Kyara refuse tout client hors navigateur (`403 verification_required`, Cloudflare et anti-robots) : notre serveur n'appelle jamais Kyara, et on ne contourne pas sa protection. Une collection envoyée par le navigateur du joueur serait falsifiable ; lue par l'équipe, depuis le compte « Kiraku » que le joueur ajoute en ami sur Kyara, elle est fiable.

**Parcours.**

- Le joueur (compte non invité, lié à Discord) clique « Demander l'import » sur `/compte/import-kyara` (demande PENDING, rien à coller), ajoute le compte Kiraku en ami sur Kyara et lui montre sa collection.
- Toute l'équipe (ADMIN et DEV, `canProcessKyaraImports`) a la main sur l'import : file, décisions et réglages, interrupteur compris. Chaque membre génère son favori dans `/admin/kyara` : il porte sa clé (32 octets, empreinte SHA-256 dans `KyaraStaffKey`, remplacée à chaque génération).
- Sur Kyara, connecté au compte Kiraku, il ouvre le profil d'un ami et clique le favori « Envoyer à Kiraku » (`lib/kyara/bookmarklet.ts`) : collection de l'ami, profil (avatar, donc ID Discord) et raretés, puis `/admin/kyara/recevoir#<lot>` (`lib/kyara/payload.ts`, `v2z` compressé, avec la clé). Le jeton Kyara ne quitte jamais kyara.games.
- La page de réception efface le fragment et l'envoie à l'action : clé du membre connecté vérifiée, demande PENDING retrouvée par l'ID Discord de l'avatar, profil Kyara enregistré. Lecture sûre : versée dans la même transaction (DONE). Lecture douteuse (`reviewReason` : avatar sans ID Discord, rien de lu, moins de personnages que le total annoncé) : READY, « À vérifier », puis « Verser » après l'aperçu ou « Refuser » avec un motif. Avatar sans ID Discord : l'équipe choisit la demande et confirme.

**Règles** (`lib/kyara/plan.ts`), par personnage Kyara (l'id Kyara est l'id AniList, donc `Card.anilistId`, cartes de base seulement ; les copies en plus ne rapportent rien) : absent du catalogue ou non publié → Zeni de la rareté Kyara ; plus rare chez nous que chez Kyara (plafond) → Zeni de la rareté Kyara ; déjà possédé → valeur de recyclage de notre rareté ; sinon la carte. Plafond de Zeni par import.

**Une seule fois** par compte Kiraku, par Discord et par profil Kyara (index uniques partiels sur `KyaraImport` ; le profil Kyara, connu à la lecture seulement, est verrouillé dès qu'il est lu). Le verrou survit à la suppression du compte. **Fenêtre** : `kyaraImport.windowDays` jours à partir de la sortie pour un compte déjà inscrit, de l'inscription (`User.registeredAt`, posé par trigger) pour un nouveau.

**Effets neutralisés.** Les découvertes importées (`Discovery.imported`) ne comptent ni pour la mission « découvrir des cartes » ni pour le Wrapped ; les Zeni (`KYARA_IMPORT`) ne sont ni un gain ni une source du Wrapped. Aucun gros tirage ni annonce.

**RGPD.** Collection lue, pseudo et avatar Kyara effacés `kyaraImport.retentionDays` jours après la clôture (cron quotidien) ; ids et totaux gardés pour le verrou. Export, anonymisation et suppression traités.

**Réglages** (`/admin/kyara`) : interrupteur (aussi dans les fonctionnalités), date de sortie, jours de fenêtre, profil Kyara du compte Kiraku, Zeni par rareté Kyara, plafond, conservation.

## Parrainage v2 et événement Ennichi

Le parrainage de l'étape 7 rapportait trop peu : un ami qualifié valait moins d'une heure de réserve gratuite. Rien ne se passait pendant deux jours, et l'ami invité arrivait sur un formulaire. La v2 récompense chaque étape du filleul, des deux côtés et bien plus fort, fait de chaque lien partagé une invitation, et s'ouvre par un événement, l'Ennichi 縁日 (la fête des liens). Montants choisis le 2026-11-23 ; ce sont des lots, tous réglables dans `/admin/parrainage`.

### Étapes du filleul

Quatre étapes, chacune versée automatiquement une fois par côté, avec une notification (et un push) des deux côtés. Un jour actif est un jour (fuseau `game.timeZone`) où le filleul a ouvert au moins un booster, compté depuis le rattachement.

| Étape | Condition | Filleul | Parrain |
| --- | --- | --- | --- |
| 1 · Arrivée | compte inscrit et vérifié, parrain rattaché | 20 boosters + 1 Jūbako | 1 booster Mythique + 5 boosters |
| 2 · Installé | 48 h depuis le rattachement, 20 boosters ouverts hors cadeau depuis le rattachement (le premier, ouvert en invité juste avant l'inscription, compte) | 2 boosters Mythiques + 10 boosters + 2 000 Zeni | 1 booster Mythique + 2 Jūbako + 1 000 Zeni |
| 3 · Accro | 5 jours actifs dans ses 14 premiers (jour du rattachement compris) | 1 Divin + 1 booster Mythique + 10 boosters | 1 Divin + 5 boosters |
| 4 · Fidèle | 15 jours actifs dans ses 30 premiers | 2 Divins + 1 booster Mythique | 2 Divins |

« Boosters » : boosters standard, versés en crédits. Une étape dont la fenêtre est passée ne se rattrape pas. L'étape 2 remplace l'ancienne qualification : c'est elle qui compte pour les paliers, le banzuke et les lanternes.

### Paliers, grand-parrainage, plafond

Paliers du parrain, en amis installés (étape 2 atteinte, révoqués exclus) depuis toujours, en plus des étapes :

| Amis | Récompense |
| --- | --- |
| 1 | badge 縁 Parrain + cadre de profil « fil rouge » |
| 3 | 1 Divin |
| 5 | 1 Mythique au choix |
| 10 | 1 booster Mythique + 2 Divins + badge 募 Recruteur |
| 25 | rôle Ambassadeur, proposé à l'équipe qui le valide |
| 50 | 2 Mythiques au choix |
| 100 | carte 1/1 + nom au mur des légendes |

- **Mythique au choix** (nouveau) : un bon ; le joueur choisit une Mythique publiée du catalogue, le serveur vérifie le bon et verse la carte dans la même transaction.
- **Carte 1/1** (nouveau) : édition gravée d'un seul exemplaire (voir « Éditions gravées numérotées ») d'une carte choisie par le gagnant, créée quand il utilise son bon (tirage réservé n° 1000, sceau 唯, un seul par carte).
- **Grand-parrainage** : quand le filleul d'un filleul atteint l'étape 2, le grand-parrain reçoit 1 Impérial + 1 Jūbako. Un seul niveau ; ne compte pas pour les paliers.
- **Plafond** : 30 filleuls par mois en v2 (`referral.v2.maxPerMonth`), levé pendant l'Ennichi ; la v1 garde `referral.maxPerMonth` (10) tant que la v2 est coupée.

### Chaque partage est une invitation

- Les liens de tirage, de profil, de vitrine, du Wrapped, de table de casino et de salle de combat d'un joueur inscrit portent son code en `?ref=CODE` sur l'adresse du contenu : `proxy.ts` pose le cookie du parrain après un simple contrôle de format, puis le contenu s'ouvre (jamais de redirection hors du site). Aperçu : « Pseudo a tiré X · 20 boosters offerts si tu le rejoins ».
- **Arrivée en cadeau** : une pochibukuro scellée au nom du parrain s'ouvre sur le cadeau de bienvenue ; l'ami ouvre un premier booster en invité, crée son compte, et l'étape 1 tombe à l'inscription.
- **Arbre des liens** sur le profil public : son parrain, ses filleuls installés et les leurs, reliés par des fils rouges (masquable dans les réglages du profil).
- **Code perso** (`/i/TRISTREN`) pour les Ambassadeurs et les comptes choisis par l'équipe : unique, validé par l'équipe ; l'ancien code reste valide.

### Anti-farm : payer selon la confiance

On ne refuse personne de plus qu'aujourd'hui ; la confiance décide quand on paie.

- **Vérification** : Discord ou e-mail, comme aujourd'hui. Discord de plus de 30 jours quand il est lié (date lue dans l'identifiant Discord) : chaque étape paie dès qu'elle est atteinte. E-mail seul ou Discord plus récent : les boosters Mythiques du parrain des étapes 1 et 2 ne sont versés qu'à l'étape 3 (tout de suite si le filleul lie ensuite un Discord ancien ; perdus s'il s'arrête avant l'étape 3).
- **Filleul une seule fois** par compte Discord et par boîte e-mail (alias ramenés à la même boîte), même après déliaison ou suppression du compte : empreinte gardée, comme pour l'import Kyara.
- **Appareil commun** (même cookie `kiraku.device` chez le parrain et le filleul, ou chez deux filleuls du même parrain) : le parrainage passe « À vérifier » et rien n'est versé avant la décision de l'équipe. Une IP partagée seule ne bloque rien (frères et sœurs, lycée) mais compte dans le score.
- **Score de la paire** (`lib/anticheat/score.ts`) recalculé avant chaque grosse récompense (étapes 3 et 4, paliers à partir de 3, lots de l'Ennichi) : au-dessus du seuil, la récompense attend l'équipe.
- **Transferts** : pendant 14 jours, les cartes du filleul ne se vendent, ne s'offrent, ne s'échangent ni ne se misent ; pendant 30 jours, rien ne passe du filleul à son parrain (l'inverse reste permis).
- **Triche avérée** : les deux comptes bannis (bans réseau, le ban suit l'appareil) et tout ce que le parrainage a versé est repris (crédits non ouverts, Zeni dans la limite du solde, cartes encore possédées). La règle est écrite sur `/parrainage`.
- Restent : 3 rattachements par IP et par jour, fenêtre de saisie du code, pas de cycle. Pas de contrôle des VPN pour l'instant ; à ajouter si des abus apparaissent.
- **Prérequis** : les bans réseau en production.

### Événement Ennichi 縁日

Quatorze jours, lancés dès que le parrainage v2 est prêt (pas de date fixe), derrière leur interrupteur, puis 3 jours de clôture. L'événement doit être très visuel : maquettes validées avant le code du visuel (rue des lanternes, pochibukuro d'invitation, banzuke, omikuji, arbre des liens).

- **Rue des lanternes** (objectif commun) : chaque ami arrivé pendant l'événement pose une lanterne éteinte sur l'accueil, qui s'allume quand il atteint l'étape 2 (jusqu'à la clôture). À chaque palier de lanternes allumées (quatre seuils : 25, 50, 200 et 500 lanternes, choisis le 2026-11-24), chaque joueur éligible reçoit le lot entier du palier, versé tout seul ; éligible : compte inscrit et vérifié, au moins un booster ouvert pendant l'événement, limite par IP. Lots choisis le 2026-11-23, par joueur :

  | Palier | Lot pour chaque joueur |
  | --- | --- |
  | 一 | 30 boosters + 2 Jūbako |
  | 二 | 50 boosters + 2 Impériaux + 1 booster Mythique |
  | 三 | 80 boosters + 3 boosters Mythiques + 1 Divin |
  | 四 | 250 boosters + 3 Divins + 1 Mythique au choix |

  Seuils et lots se règlent dans l'admin ; un palier déjà atteint se fige (son lot ne change plus).
- **Banzuke 番付** : classement des recruteurs en amis arrivés pendant l'événement et installés, arrêté à la clôture, une fois les cas « À vérifier » tranchés. 1er : titre Yokozuna + carte 1/1 + 3 Mythiques au choix ; 2e et 3e : Ōzeki + 2 Mythiques au choix ; 4e à 10e : Sekiwake + 1 Mythique au choix ; 11e à 50e : 1 Divin. Titres permanents, marqués de l'édition.
- **Omikuji おみくじ** : tirage en direct le soir de la clôture, un ticket par ami arrivé pendant l'événement et installé. Cagnotte : 1 carte 1/1, 20 Divins, 55 boosters Mythiques. Chaque ticket gagne au plus un lot (choix du 2026-11-24), du plus rare au moins rare : la 1/1, puis les Divins, puis les Mythiques ; ce qui reste n'est pas distribué (avec 76 tickets ou plus, toute la cagnotte part). Tirage par le serveur, vérifiable comme le pile ou face.
- **Bonus** : pour les amis arrivés pendant l'événement, les étapes 1 et 2 comptent double, des deux côtés.

**Designs retenus le 2026-11-23** (une proposition par écran dans les quatre ateliers de maquettes) :

| Atelier | Écran : proposition |
| --- | --- |
| Parrainage | Annonce : enveloppe · Page sans filleul : fuda à retourner · Page avec filleuls : tableau · Vue du filleul : bienvenue d'abord · Paliers : sceaux · Cadeaux reçus : le nœud · Notifications : ligne et sachets · Bons : grille · Mur des légendes : rouleau d'honneur |
| Invitation | Arrivée (invité) : lettre · Arrivée (déjà inscrit) : carte centrée · Après le premier booster : sous le récap · Partager : feuille de partage · Aperçus des liens : enveloppe · Arbre des liens : arbre · Cadre et badges : double anneau · Code perso : plaque d'or |
| Ennichi | Bannière : rue des lanternes · Page de la fête : ta fête d'abord · Lanternes : liste des paliers · Banzuke en direct : tableau de sumo · Banzuke final : podium A Dohyō (retravaillé, choisi le 2026-11-24 contre B Estrade d'honneur) · Omikuji : rouleaux · Vérification : en bref · Explications « ? » : carte dorée |
| Équipe | Suivi : tableau · Fiche : deux colonnes · File « À vérifier » : cartes · Ambassadeurs et codes : cartes · Admin de l'Ennichi : tableau de bord · Salon Discord privé : message détaillé · Annonce à la communauté : annonce détaillée |

**Réglages.** Interrupteurs du parrainage et de l'Ennichi. Lots de chaque étape et de chaque côté, des paliers, du grand-parrainage, des paliers de lanternes, des rangs du banzuke et de la cagnotte ; conditions et fenêtres des étapes ; seuils de confiance (âge du compte Discord, score) ; durées des verrous ; plafond ; dates, seuils des lanternes et multiplicateur de l'Ennichi. `/admin/parrainage` tient aussi la file « À vérifier » (indices, valider, révoquer, révoquer et bannir), les codes perso et les Ambassadeurs proposés.

### Mise en œuvre (écarts et précisions, 2026-11-24)

- **Liens partagés** : `?ref=CODE` sur l'adresse du contenu au lieu de `/i/CODE?vers=…`. `/i/CODE` est devenue la page
  d'arrivée (la lettre au nom du parrain) : une page ne peut pas poser de cookie, `proxy.ts` le fait pour les deux.
- **Étapes horodatées** (`step1At` à `step4At` sur `Referral`) plutôt qu'un numéro d'étape : l'étape 4 peut tomber
  après une étape 3 manquée. Les états (verrouillée, atteinte et versée, manquée, en vérification) se déduisent dans
  `lib/referral/`.
- **Étape 2 hors cadeau** : seules comptent les ouvertures de la réserve gratuite ou achetées (`BoosterOpening.source`
  FREE ou PAID), depuis le rattachement moins `referral.v2.guestGraceHours` (le premier booster ouvert en invité
  compte). Les cadeaux comptent pour les jours actifs.
- **Versements** : tout est versé tout seul (étapes, part « confiance », paliers, grand-parrainage, lanternes, prix du
  banzuke et de l'omikuji). `ReferralReward` empêche le double versement et sert de journal à la reprise. Seuls les
  bons (Mythique au choix, carte 1/1) demandent de choisir une carte, sur `/parrainage/bons`.
- **Lots** : jusqu'à 500 boosters par ligne de lot (`MAX_LOT_BOOSTERS`, pour les paliers de lanternes), 50 cartes.
- **Ennichi** : phases annoncée, fête, clôture, tirage fait. L'empreinte de la graine est engagée dès que la fête est
  allumée et datée. Le cron `/api/cron/ennichi` (toutes les 5 minutes) fige les paliers atteints, envoie leurs lots par
  lots et tire seul à la date de clôture si l'équipe ne l'a pas fait. « Contrôler » puis « Arrêter et tirer » se font
  depuis `/admin/parrainage/ennichi`. Les titres sumo sont des cosmétiques `ennichi-{édition}-{titre}` (condition
  `ENNICHI_TITLE`).
- **Annonce** : la fenêtre « Le parrainage change » (`ReferralStory`, design « Enveloppe ») est datée par
  `referral.v2.announceAt` comme celle du casino, et se rouvre par « Comment ça marche » sur `/parrainage`. Le post de
  la communauté part de `/admin/parrainage/annonce` dans `DISCORD_ANNOUNCE_CHANNEL_ID`, avec @everyone.
- **Droits** : toutes les pages `/admin/parrainage/*` (file, suivi, codes perso, Ennichi, annonce, réglages, lots,
  ancien parrainage) sont ouvertes à l'équipe entière, ADMIN et DEV (`canManageReferrals`) ; chaque action va au journal
  admin. Depuis le 2026-11-25, cela couvre aussi le contenu des lots du parrainage et de l'Ennichi
  (`/admin/parrainage/lots` : ceux que leurs réglages versent, ou créés depuis cette page ; un lot qui sert aussi
  ailleurs et l'envoi de lots aux joueurs restent à l'admin dans `/admin/lots`) et la révocation d'un parrainage v1.

## Fluidité et animations

Objectif : un téléphone milieu de gamme en 4G charge une page en moins de 2,5 s (LCP), répond à un appui en moins de 200 ms (INP), ne fait pas sauter la page (CLS < 0,1) et anime à 60 images par seconde.

- **Rendu** : pages en Server Components avec streaming (`loading.tsx` et `Suspense`), squelettes de chargement aux couleurs Yoru, pages publiques (wiki, raretés, classement) mises en cache et régénérées périodiquement.
- **Navigation** : préchargement des liens (`next/link`) et transitions entre pages avec l'API View Transitions ; la carte touchée s'agrandit en fiche au lieu de recharger la page.
- **Réponse immédiate** : mises à jour optimistes (`useOptimistic`) pour les enchères, les vitrines et les amis ; à l'ouverture d'un booster, le cordon commence à se dénouer pendant l'appel serveur et les cartes se révèlent dès la réponse.
- **Animations** : uniquement `transform` et `opacity`, ressorts courts (200–400 ms), Motion chargé en version légère (`LazyMotion`) ; l'effet holo met à jour des variables CSS dans `requestAnimationFrame` et s'arrête hors de l'écran. Tout est adouci si `prefers-reduced-motion`.
- **Images** : `next/image` en AVIF/WebP aux bonnes tailles, couleur dominante en fond pendant le chargement, priorité seulement aux images visibles.
- **Polices** : `next/font`, avec des sous-ensembles pour les polices japonaises (Yuji Syuku ne sert qu'aux quelques kanji des sceaux et emblèmes), sinon elles pèsent plusieurs mégaoctets.
- **Listes longues** : collection et marché virtualisés (TanStack Virtual) au-delà de quelques centaines de cartes.
- **Poids du JavaScript** : composants client petits, imports dynamiques pour le replay de combat, l'admin et les sons ; budget suivi à chaque build.
- **Mesure** : Vercel Speed Insights en production et Lighthouse en CI, avec un seuil qui bloque une régression.

## Schéma Prisma

Le point central : `Card` est le modèle (le personnage, ses stats, sa rareté) et `UserCard` est l'exemplaire possédé. C'est l'exemplaire qui se vend, s'expose en vitrine et combat. Les modèles Auth.js (`Account`, `Session`, `VerificationToken`) s'ajoutent tels que fournis par l'adaptateur.

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"] // inutile si ta version de Prisma l'a déjà stabilisé
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")  // URL poolée (Supabase, mode transaction)
  directUrl = env("DIRECT_URL")    // pooler en mode session, pour migrate
}

enum Rarity { COMMON UNCOMMON RARE EPIC LEGENDARY MYTHIC }
enum Role { USER ADMIN }
enum CardStatus { COLLECTION AUCTION BATTLE CASINO } // CASINO : misée sur une table de pile ou face ouverte (séquestre)
enum FriendStatus { PENDING ACCEPTED }
enum AuctionStatus { ACTIVE SOLD EXPIRED CANCELLED }
enum CoinReason { SIGNUP BID_HOLD BID_REFUND SALE FEE DISSOLVE BATTLE_WIN DAILY MISSION REFERRAL ADMIN SHOP DISCORD_LINK BOOSTER GIFT SEASON ABILITY }

model User {
  id            String   @id @default(cuid())
  username      String   @unique
  email         String?  @unique
  image         String?
  coins         Int      @default(500) // solde en Zeni
  boosterStock  Int      @default(10)
  boosterAnchor DateTime @default(now()) // début du cycle de 10 min en cours
  rankPoints    Int      @default(0)   // points de classement (mode classé)
  battleTeam    String[]               // ids de Card de la dernière équipe de combat
  decks         Deck[]                 // équipes nommées (id, name, cardIds : ids de Card)
  role          Role     @default(USER)
  bannedAt      DateTime?
  isGuest       Boolean  @default(true)
  pityCount     Int      @default(0)  // boosters ouverts depuis la dernière Mythique
  standardCount Int      @default(0)  // pour le booster doré (tous les 10)
  bannerPity    Json     @default("{}") // { boosterTypeId: boosters sans vedette }
  discordJoinedAt DateTime?          // a cliqué sur « Rejoindre le serveur »
  locale        String   @default("fr") // fr | en
  birthDate     DateTime?              // inutilisé : pas de contrôle d'âge (étape 10)
  termsVersion  Int?                   // version des CGU acceptée
  deletionRequestedAt DateTime?        // suppression RGPD en attente
  referralCode  String   @unique @default(cuid())
  referredById  String?
  profileVisibility ProfileVisibility @default(PUBLIC) // invités créés en PRIVATE
  showCollection    Boolean  @default(true)
  privacyChosenAt   DateTime?          // choix du joueur : l'inscription ne le change plus
  createdAt     DateTime @default(now())

  cards        UserCard[]
  showcases    Showcase[]
  sentFriends  Friendship[] @relation("requester")
  recvFriends  Friendship[] @relation("addressee")
  auctions     Auction[]    @relation("seller")
  bids         Bid[]
  ledger       CoinTransaction[]
  // + relations Auth.js
}

model Series {
  id         String @id @default(cuid())
  name       String
  slug       String @unique
  cards      Card[]
  universeId String?   // sans groupe, la série forme son propre univers
  universe   Universe? @relation(fields: [universeId], references: [id], onDelete: SetNull)
}

model Universe {
  id     String   @id @default(cuid())
  name   String   @db.VarChar(80)
  series Series[]
}

model Card {
  id        String @id @default(cuid())
  name      String
  slug      String @unique
  seriesId  String
  series    Series @relation(fields: [seriesId], references: [id])
  rarity    Rarity
  anilistId Int    @unique // id du personnage sur AniList (= id de Kyara)
  nameNative String?       // nom japonais, affiché en filigrane
  favorites Int             // favoris AniList au moment de l'import
  rank      Int    @unique // 1 = le plus populaire
  imageUrl  String
  gender    String?  // Female | Male | … (AniList)
  birthMonth Int?
  birthDay  Int?
  role      String?  // MAIN | SUPPORTING dans l'œuvre principale
  mediaType String?  // ANIME | MANGA
  genres    String[]
  tags      String[] // tags de rang ≥ 60
  year      Int?
  season    String?  // WINTER | SPRING | SUMMER | FALL
  seasonYear Int?
  studio    String?
  power     Int // 力 attaque en combat
  ki        Int // 気 défense ; HP et vitesse sont dérivés
  copies    UserCard[]

  @@index([rarity])
}

model UserCard {
  id         String     @id @default(cuid())
  ownerId    String
  owner      User       @relation(fields: [ownerId], references: [id])
  cardId     String
  card       Card       @relation(fields: [cardId], references: [id])
  status     CardStatus @default(COLLECTION)
  obtainedAt DateTime   @default(now())
  showcaseItems ShowcaseItem[]
  auctions   Auction[]

  @@index([ownerId, cardId])
  @@index([ownerId, status])
}

model Showcase {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  sortOrder Int      // 0 = à l'honneur
  name      String?  @db.VarChar(32)
  layout    String   // lib/showcase/layouts.ts
  theme     String   @default("none") // lib/showcase/theme-registry.ts
  items     ShowcaseItem[]

  @@index([userId, sortOrder])
}

model ShowcaseItem {
  showcaseId String
  showcase   Showcase @relation(fields: [showcaseId], references: [id], onDelete: Cascade)
  position   Int      // 1 à la capacité de la disposition
  userCardId String
  userCard   UserCard @relation(fields: [userCardId], references: [id], onDelete: Cascade)

  @@id([showcaseId, position])
  @@unique([showcaseId, userCardId])
}

model Friendship {
  id          String       @id @default(cuid())
  pairKey     String       @unique // ids triés : une ligne par paire, quel que soit le sens
  requesterId String
  addresseeId String
  requester   User         @relation("requester", fields: [requesterId], references: [id])
  addressee   User         @relation("addressee", fields: [addresseeId], references: [id])
  status      FriendStatus @default(PENDING)
  createdAt   DateTime     @default(now())
  acceptedAt  DateTime?
  declinedAt  DateTime?    // refus silencieux

  @@index([addresseeId, status])
  @@index([requesterId, status])
}

// Étape 6 : UserBlock, FriendRequestCooldown et Gift, voir prisma/schema.prisma

model Auction {
  id              String        @id @default(cuid())
  sellerId        String
  seller          User          @relation("seller", fields: [sellerId], references: [id])
  userCardId      String
  userCard        UserCard      @relation(fields: [userCardId], references: [id])
  startPrice      Int
  buyoutPrice     Int?
  currentBid      Int?
  currentBidderId String?
  endsAt          DateTime
  status          AuctionStatus @default(ACTIVE)
  createdAt       DateTime      @default(now())
  bids            Bid[]

  @@index([status, endsAt])
  @@index([sellerId, status])
}

model Bid {
  id        String   @id @default(cuid())
  auctionId String
  auction   Auction  @relation(fields: [auctionId], references: [id])
  bidderId  String
  bidder    User     @relation(fields: [bidderId], references: [id])
  amount    Int
  createdAt DateTime @default(now())

  @@index([auctionId, amount])
}

model Mission {
  id       String @id @default(cuid())
  key      String @unique // ex. OPEN_5_BOOSTERS, WIN_1_BATTLE
  period   String         // DAILY | WEEKLY
  goal     Int
  lotId    String  // récompense = un lot
  active   Boolean @default(true)
}

model UserMission {
  userId    String
  missionId String
  periodKey String   // ex. 2026-10-13 ou 2026-W42
  progress  Int      @default(0)
  claimedAt DateTime?

  @@id([userId, missionId, periodKey])
}

model Notification {
  id        String   @id @default(cuid())
  userId    String
  type      NotificationType // FRIEND_REQUEST | FRIEND_ACCEPTED | GIFT_RECEIVED, puis OUTBID | SOLD | BATTLE_CHALLENGE
  actorId   String?
  refId     String?
  payload   Json     // ids et nombres uniquement
  readAt    DateTime?
  createdAt DateTime @default(now())

  @@index([userId, readAt])
}

model Feedback {
  id        String   @id @default(cuid())
  userId    String?
  message   String
  createdAt DateTime @default(now())
}

model LegalPage {            // mentions, confidentialité, cookies, CGU, CGV
  id        String   @id @default(cuid())
  slug      String   // mentions-legales | confidentialite | cookies | cgu | cgv
  locale    String   // fr | en
  title     String
  body      String   // markdown
  version   Int
  updatedAt DateTime @updatedAt

  @@unique([slug, locale, version])
}

model BoosterType {          // booster standard ou bannière vedette
  id              String    @id @default(cuid())
  slug            String    @unique
  name            String
  kind            String    // STANDARD | RARITY | FILTERED | BANNER
  family          String    // standard | rarete | demographie | genre | personnage | epoque | special
  emblem          String    // kanji affiché sur le paquet
  theme           Json      // couleurs et motif du paquet
  filter          Json      // PoolFilter
  slotFloors      String[]  // ["COMMON","COMMON","UNCOMMON","RARE"]
  poolCardIds     String[]  // recalculé après chaque import
  usesFreeStock   Boolean   @default(true)
  featuredCardIds String[]  // cartes vedettes d'une bannière
  featuredPity    Int       @default(100) // vedette garantie au 100e booster
  priceZeni       Int       @default(200) // prix quand le stock gratuit est vide
  startsAt        DateTime?
  endsAt          DateTime?
  active          Boolean   @default(true)
}

model BoosterOpening {       // un tirage, partageable par lien
  id            String   @id @default(cuid())
  userId        String
  boosterTypeId String
  cardIds       String[] // ids de UserCard
  catalogCardIds String[] // ids de Card dans le même ordre (lisible après recyclage ou vente)
  golden        Boolean  @default(false)
  divine        Boolean  @default(false)
  createdAt     DateTime @default(now())

  @@index([userId, createdAt])
}

model ShopItem {
  id            String    @id @default(cuid())
  name          String
  boosterTypeId String?
  quantity      Int       @default(1)
  priceZeni     Int?      // achat en Zeni
  priceCents    Int?      // achat en euros (Stripe, plus tard)
  stripePriceId String?
  active        Boolean   @default(true)
  startsAt      DateTime?
  endsAt        DateTime?
}

model Purchase {
  id              String   @id @default(cuid())
  userId          String
  shopItemId      String
  currency        String   // ZENI | EUR
  amount          Int
  stripeSessionId String?  @unique
  status          String   // PENDING | PAID | REFUNDED
  createdAt       DateTime @default(now())
}

model Review {               // avis publics (note + texte), séparés des bugs
  id        String   @id @default(cuid())
  userId    String   @unique // un avis par joueur, modifiable
  rating    Int      // 1 à 5
  body      String
  hidden    Boolean  @default(false)
  pinned    Boolean  @default(false)
  createdAt DateTime @default(now())
}

model GameSetting {          // tous les réglages modifiables depuis l'admin
  key       String   @id      // ex. booster.intervalMinutes, ranked.tiers
  value     Json
  updatedAt DateTime @updatedAt
  updatedBy String?
}

model AdminLog {
  id         String   @id @default(cuid())
  adminId    String
  action     String   // ex. USER_BAN, GIVE_ZENI, SETTING_UPDATE
  targetType String
  targetId   String?
  before     Json?
  after      Json?
  createdAt  DateTime @default(now())

  @@index([createdAt])
}

model Lot {
  id       String    @id @default(cuid())
  name     String
  zeni     Int       @default(0)
  boosters Int       @default(0)
  items    LotItem[]
}

model LotItem {
  id       String  @id @default(cuid())
  lotId    String
  lot      Lot     @relation(fields: [lotId], references: [id])
  cardId   String? // une carte précise…
  rarity   Rarity? // …ou une carte tirée dans une rareté
  quantity Int     @default(1)
}

model Season {
  id       String   @id @default(cuid())
  number   Int      @unique
  startsAt DateTime
  endsAt   DateTime
  active   Boolean  @default(false)
}

model Discovery {          // fiche wiki débloquée, même si la carte est revendue
  userId    String
  cardId    String
  createdAt DateTime @default(now())

  @@id([userId, cardId])
}

model CoinTransaction {
  id        String     @id @default(cuid())
  userId    String
  user      User       @relation(fields: [userId], references: [id])
  amount    Int        // + crédit, - débit
  reason    CoinReason
  refId     String?    // id d'enchère, de combat…
  createdAt DateTime   @default(now())

  @@index([userId, createdAt])
}

enum BattleMode {
  FRIEND // salle privée avec un code, non classée
  EXHIBITION // file d'attente, non classée
  RANKED // file d'attente classée (étape 9b)
}

enum BattleStatus {
  WAITING // salle d'amis ouverte, en attente du second joueur
  ACTIVE
  FINISHED
  CANCELLED // salle expirée ou fermée avant le début
}

enum BattleEndReason {
  KO
  FORFEIT
  TIMEOUT // trop de tours expirés d'affilée
  TURN_LIMIT
}

// Une partie : setup figé + graine + actions (BattleAction) suffisent à la rejouer à l'identique.
// state est le cache de l'état courant ; version sert à la concurrence optimiste.
model Battle {
  id            String           @id @default(cuid())
  mode          BattleMode
  status        BattleStatus     @default(WAITING)
  code          String?          @unique // code ami tant que la salle attend
  codeExpiresAt DateTime?
  seed          Int // 0 ≤ seed < 2^31, tirée par le serveur
  p1Id          String
  p1            User             @relation("battleP1", fields: [p1Id], references: [id], onDelete: Cascade)
  p2Id          String? // null = bot
  p2            User?            @relation("battleP2", fields: [p2Id], references: [id], onDelete: Cascade)
  botName       String? // nom du bot affiché (lib/battle/bot.ts)
  p1Team        String[] // ids de UserCard (vides pour le bot)
  p2Team        String[]
  setup         Json? // BattleSetup (lib/battle/types.ts), posé au lancement
  state         Json? // BattleState courant
  version       Int              @default(0)
  turnEndsAt    DateTime?
  winnerSide    Int? // 0 = p1, 1 = p2, null = nul ou en cours
  endReason     BattleEndReason?
  rewardZeni    Int              @default(0) // versés au gagnant
  createdAt     DateTime         @default(now())
  startedAt     DateTime?
  endedAt       DateTime?
  actions       BattleAction[]

  @@index([p1Id, createdAt])
  @@index([p2Id, createdAt])
  @@index([status, turnEndsAt])
}

// Journal des actions d'une partie, dans l'ordre (seq = BattleState.seq avant l'action)
model BattleAction {
  battleId  String
  battle    Battle   @relation(fields: [battleId], references: [id], onDelete: Cascade)
  seq       Int
  side      Int
  payload   Json // Action (lib/battle/types.ts)
  createdAt DateTime @default(now())

  @@id([battleId, seq])
}

// File d'attente : l'équipe est déjà bloquée (UserCard en BATTLE) ; seenAt prouve que le joueur attend encore
model BattleQueue {
  userId     String     @id
  user       User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  mode       BattleMode
  rankPoints Int
  team       String[] // ids de UserCard
  joinedAt   DateTime   @default(now())
  seenAt     DateTime   @default(now())

  @@index([mode, joinedAt])
}

// Atelier : capacité achetée pour un personnage (pas l'exemplaire), jamais remboursée, rééquipable à volonté
model AbilityPurchase {
  id        String   @id @default(cuid())
  userId    String   // → User, onDelete: Cascade
  cardId    String   // → Card, onDelete: Restrict
  kind      String   // KEYWORD | TECHNIQUE
  ability   String
  price     Int      // CHECK > 0
  createdAt DateTime @default(now())
  @@unique([userId, cardId, kind, ability]) // une capacité ne se paie qu'une fois, même avec deux clics simultanés
  @@index([cardId])
  @@index([createdAt])
}

// Kit choisi par le joueur pour un personnage ; absent = kit tiré au sort
model CardLoadout {
  userId    String   // → User, onDelete: Cascade
  cardId    String   // → Card, onDelete: Cascade
  keywords  String[]
  technique String
  updatedAt DateTime @updatedAt
  @@id([userId, cardId])
}
```

`coins` sur `User` est le solde rapide ; `CoinTransaction` est le journal qui permet de vérifier qu'aucune pièce n'apparaît de nulle part.

## Roadmap

Construis dans cet ordre : chaque étape est jouable seule et sert de base à la suivante. Les boosters d'abord, parce que tout le reste consomme des cartes.

1. **Socle** — projet Next.js, Prisma + Neon, Auth.js (compte invité puis Discord), next-intl fr/en, tokens de la DA Kiraku dans Tailwind, déploiement Vercel.

   ```bash
   npx create-next-app@latest kiraku --ts --tailwind --app
   cd kiraku
   npm i @prisma/client @prisma/adapter-neon @neondatabase/serverless next-auth @auth/prisma-adapter zod next-intl
   npm i -D prisma
   npx prisma init
   # .env : DATABASE_URL (pooler) + DIRECT_URL (directe) depuis la console Neon
   npx prisma migrate dev --name init
   ```
2. **Catalogue** — import AniList (rangs, raretés, stats, champs de filtre) et wiki.
3. **Boosters** — stock de 10 min, ouverture atomique, pitié, doré, divin, animation d'ouverture du sachet (déchirure de la bande), récap d'ouverture ; premier panneau admin pour régler taux et délais sans redéployer.
4. **Types de boosters** — `BoosterType`, pools filtrés, page de choix, bannières vedettes.
5. **Collection et profil** — collection, fiche carte, recyclage, vitrines (plusieurs par joueur, dispositions, thèmes), profil public.
6. **Social** — amis, cadeaux, notifications.
7. **Économie** — Zeni, journal `CoinTransaction`, missions, parrainage, boutique en Zeni.
8. **Hôtel des ventes** — ventes, enchères, clôture planifiée. Avant la mise en ligne, un test lance 50 enchères simultanées et vérifie que la somme des soldes ne bouge pas.
9. **Combat** — 9a : combat en direct (moteur avec seed, code ami, exhibition, bot, Ably, replay) ; 9b : mode classé et saisons.
10. **Conformité et finitions** — pages légales, « Mes données », modal Discord (désactivé), tuile Casino « Bientôt », PWA, admin complet, audits de sécurité et de performance, tests sur un vrai téléphone en 375 px. Pas de contrôle d'âge (clause déclarative dans les CGU). Checklist de mise en ligne : `docs/MISE-EN-PRODUCTION.md`.
11. **Urushi** — jetons de la DA, primitives UI, nav en capsule flottante, fuda et sachets revus, passage écran par écran (11a à 11c).
12. **Social et confort de jeu** (12a à 12h) — voir « Étape 12 » ci-dessous :
    - ouverture : recentrage sur le nouveau booster, actions du récap fixées au-dessus de la nav ;
    - familles de boosters toutes atteignables (feuille « Toutes » sur mobile, retour à la ligne et scroll-spy sur desktop) ;
    - carrousel « En direct · Gros tirages » (`NotablePull`) ;
    - collection par albums (une tuile par série) ;
    - suppression définitive de comptes dans l'admin, avec sélection multiple ;
    - échanges entre amis, chat éphémère entre amis, profil personnalisable (titres, cadres, badges).
13. **Sachets scellés** — Divin et Apocalyptique : chute pendant l'ouverture, `SealedDrop`, karma de l'Apocalypse, cadeau empoisonné avec ses garde-fous, animations de transformation et d'ouverture, réglages et tests. Voir « Sachets scellés : Divin et Apocalyptique ».
14. **Expéditions** — 14a socle (modèles, offres du jour, lancement, clôture, verrou des cartes, admin), 14b écran et animations (laissez-passer, jauge ensō, départ, rouleau peint, rapport), 14c notifications, cron et documentation. Voir « Expéditions ».
15. **Casino : pile ou face** — `CoinFlip` et séquestre `CASINO`, tirage vérifiable, salon et tables réservées, lancer animé, cérémonie d'ouverture, annonce, badges, jauge des lancers, annonces Discord, `/admin/casino`. Voir « Casino ».
16. **Prestige** — voir « Prestige : renaissance, héritières et éditions gravées ». Maquettes validées avant le code du visuel (trois ateliers : profil et avatar, cartes, rites), puis un lot par sous-étape, chacun jouable seul derrière `prestige.enabled`. Les cinq lots sont codés sur `tristan-dev` ; restent la mise en production (`docs/MISE-EN-PRODUCTION.md`, « Lancement du prestige ») et l'essai sur un vrai téléphone :
    - **16a Exemplaires distincts.** Migration `prestige_copies` : héritage, `keptByOwner`, tirage et numéro sur `UserCard`, `UserCardOwner`, `userCardId` optionnel sur les échanges. Réglages `prestige.*` par défaut. `moveCopy` pour les cinq changements de main. Choix automatique limité aux exemplaires ordinaires (`CHOOSE_COPY`), exemplaire désigné accepté par le serveur (`userCardId`) dans la vente, le cadeau, les annonces, les offres, les échanges et le pile ou face. Recyclage qui épargne les spéciaux, recyclage d'un exemplaire spécial depuis sa ligne. Fiche carte avec la liste des exemplaires spéciaux. Tests (migration rejouée, `moveCopy` sur PGlite, garde-fou sur `ownerId`). Rien de visible tant qu'aucun exemplaire spécial n'existe.
    - **16b Renaissance.** Sélecteur d'exemplaire (`CopyPicker`) dans les feuilles de vente, de cadeau, d'annonce, d'offre, d'échange et de mise : les premières héritières naissent ici. Migration `prestige_cycles`. Seuils par rareté, préparation (`BUSY`), choix des 20, récap et Zeni dégressifs, transaction unique et idempotente, `PrestigeCycle`. Chiffre romain sur tous les avatars, bouton « Évoluer », page `/prestige` et rite 転生. Marque d'héritage sur la fuda. « Retrouvée », missions, statistiques des cosmétiques et classement des collectionneurs adaptés. Admin : interrupteur et réglages. Tests de concurrence.
    - **16c Éditions gravées.** Migration `prestige_printings`. Tirage au sort et numéro dans la transaction d'ouverture, `CardPrinting`, carrousel « En direct », lien de partage d'un tirage. Habillage estampe et cartouche d'édition, animation de la baren, affichage sur le Marché, au casino, en combat et dans le bot Discord, registre des gravées du wiki, recyclage unitaire. Admin : chances, tailles, tirages. Test des 50 ouvertures simultanées.
    - **16d Consécration et profil.** Migration `prestige_sanctuary`. Consécration et sanctuaire, conditions et cosmétiques de prestige, emakis des cycles, filtres de la collection.
    - **16e Finitions.** Export et anonymisation RGPD, annonces Discord, fiche joueur de l'admin, `docs/MISE-EN-PRODUCTION.md`, essai sur un vrai téléphone en 375 px, lint, typecheck et tests.
17. **Import Kyara** — voir « Import Kyara ». 17-0 test des routes de Kyara avec deux vrais comptes (`docs/KYARA-IMPORT.md`), 17a logique pure et réglages, 17b schéma, migration et notifications, 17c cœurs serveur, RGPD et tests en base, 17d accès de l'équipe et réglages, 17e côté joueur, 17f outillage de l'équipe (file, favori, réception, fiche), 17g textes légaux et documentation, 17h version simplifiée (demande sans adresse, favori à clé par membre, versement dès la lecture, « À vérifier » pour les cas douteux).
18. **Parrainage v2 et Ennichi** — voir « Parrainage v2 et événement Ennichi ». Prérequis : bans réseau en production. Codé sur `tristan-dev` en lots (2026-11-24) : 18a étapes du filleul, paliers, grand-parrainage et anti-farm (confiance, appareil commun, score, verrous de transfert, reprise, file « À vérifier ») ; 18b code sur tous les liens partagés, arrivée en pochibukuro, aperçus ; 18c arbre des liens, code perso, bon « Mythique au choix », carte 1/1, Ambassadeur proposé ; 18d Ennichi (lanternes, banzuke, omikuji, bonus, admin) ; 18e annonce, règlement et textes légaux, documentation. Restent l'essai sur un vrai téléphone et le lancement (`docs/MISE-EN-PRODUCTION.md`, « Lancement du parrainage v2 et de l'Ennichi »).

19. **Fresques et filtre « acquises »** — voir « Fresques 絵 » et « Filtre « acquises » ». Migration `fresques` à appliquer sur le VPS au déploiement.

Hors de ce plan : Stripe, après un avis juridique.

## Sources

- [Kyara, accueil](https://kyara.games/) et [plan du site](https://kyara.games/sitemap.xml), plus tes captures d'écran (accueil, récap d'ouverture, raretés)
- Fiches Kyara : [Gojo #1](https://kyara.games/wiki/127691), [Luffy #3](https://kyara.games/wiki/40), [Kaiji #500](https://kyara.games/wiki/5578), [Konata #501](https://kyara.games/wiki/2169)
- [Kyara, raretés](https://kyara.games/raretes) et [règles](https://kyara.games/regles)
- [AniList, limites de l'API](https://docs.anilist.co/guide/rate-limiting)
- [Stripe, activités interdites](https://stripe.com/legal/restricted-businesses)
