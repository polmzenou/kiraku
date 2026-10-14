# Kiraku — Plan technique

Oct 13, 2026 · @Kata

## Vue d'ensemble

L'appli tient en six briques qui partagent une seule base Postgres : boosters, collection, profil social, monnaie, hôtel des ventes et combat. Tout ce qui touche au hasard et à l'argent virtuel se calcule côté serveur, dans des transactions.

| Brique | Ce que fait l'utilisateur | Règle clé |
| --- | --- | --- |
| Boosters | Ouvre un booster de 6 cartes | 10 au départ, +1 toutes les 10 min, max 10 |
| Collection | Parcourt ses cartes, filtre, voit ses doublons | Chaque carte obtenue = une instance unique |
| Profil | Ajoute des amis, consulte leurs profils | Demande puis acceptation |
| Vitrine | Met 6 cartes en avant | 6 emplacements, cartes possédées uniquement |
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

**Typographie.** Toutes sur Google Fonts, sans police monospace.

- Titres : **Shippori Mincho B1** (700–800), un mincho japonais avec un latin élégant.
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
| ORM | Prisma + `@prisma/adapter-neon` | Driver serverless de Neon, transactions interactives OK via WebSocket |
| BDD | Neon Postgres | URL poolée (`-pooler`) au runtime, URL directe pour les migrations |
| Auth | Auth.js (NextAuth) + adaptateur Prisma | Discord/Google en un clic, sessions en base |
| Validation | Zod | Chaque Server Action valide ses entrées |
| Images | Vercel Blob ou Cloudinary + `next/image` | WebP redimensionné, servi par CDN |
| Anti-abus | Upstash Ratelimit | Limite ouvertures, enchères, défis |
| UI | Tailwind + Framer Motion | Animation d'ouverture et effet holo des cartes |
| Temps réel (plus tard) | Pusher, Ably ou PartyKit | Seulement si tu fais du combat en direct |

Mets la région Neon et la région des fonctions Vercel au même endroit (ex. Francfort) : c'est le gain de latence le plus simple.

## Écrans et navigation (mobile first)

Tout se conçoit d'abord pour un écran de 375 px, puis s'élargit : sur desktop, ce sont les mêmes pages avec plus de colonnes, pas des pages à part. La structure reprend celle de Kyara (en-tête avec stock, monnaie et notifications, puis une grille de tuiles) et y ajoute tes écrans.

| Écran | Route | Origine | Contenu |
| --- | --- | --- | --- |
| Boosters (accueil) | `/` | Kyara | Choix du booster par famille, stock, compte à rebours ; `/boosters` redirige ici |
| Ouverture | `/ouvrir/[slug]` | Kyara + toi | Rituel d'ouverture animé, révélation des cartes, récap |
| Compte | `/compte` | Kyara | Avatar, pseudo, lier Discord, stats (Zeni, cartes, pitié), grille de tuiles |
| Collection | `/collection` | Kyara | Filtres rareté/série, doublons, recyclage |
| Marché | `/marche` | Kyara + toi | Enchères, achat immédiat, mes ventes |
| Combat | `/combat`, `/combat/[id]` | Toi | Défis reçus, choix d'équipe, replay, historique, rang classé |
| Profil public | `/u/[username]` | Kyara + toi | Vitrine 6 cartes, stats, bouton défier / ajouter |
| Amis | `/amis` | Kyara + toi | Demandes, cadeaux, défier un ami |
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

Tes tuiles s'ajoutent à la grille du Compte : Combat, Boutique, et Casino avec l'étiquette « Bientôt ».

**Récap d'ouverture** (`/ouvrir/[slug]`). Les cartes du booster en grille (3 + 2 chez Kyara, 3 × 3 pour tes 6 cartes), chacune avec un badge « Nouveau » si le joueur ne l'avait jamais eue. En dessous :

- le compteur de pitié du booster (« Vedette garantie dans 99 boosters » pour une bannière, « Mythique garantie dans … » pour le standard) ;
- un sélecteur ×1 / ×5 / ×10 pour ouvrir plusieurs boosters d'un coup ;
- le gros bouton « Ouvrir un autre », avec son coût affiché (gratuit tant qu'il reste du stock, sinon le prix en Zeni, 200 chez Kyara) ;
- « Changer de booster », « Voir la collection », « Copier le lien » (page publique `/tirage/[id]`, d'où le modèle `BoosterOpening`) et « Image » (image partageable générée avec `next/og`) ;
- un bouton son, mémorisé.

**Carte (fuda).** Un seul composant `<Fuda size="sm | md | lg" />`, réutilisé partout (récap, collection, marché, vitrine, combat), dessiné selon la direction artistique : cadre dans la matière de la rareté, sceau kanji, numéro, nom japonais vertical, nom latin, série, stats 力 et 気. L'effet de matière (laque, or, nacre) se fait en CSS (dégradés et `mix-blend-mode`) et suit l'inclinaison du téléphone (`deviceorientation`) ou la souris sur desktop ; il est coupé si `prefers-reduced-motion`. Un appui ouvre la fiche : grande carte, stats de combat dérivées, exemplaires possédés, recycler les doublons, mettre en vente, mettre en vitrine, fiche wiki.

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
- **Booster divin** : 1 chance sur 2 000 d'avoir uniquement des Épiques ou mieux, dont une Mythique garantie.

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

## Profil, amis et vitrine

Une seule page publique `/u/[username]` sert à la fois de « Mon compte » et de profil d'ami : en-tête (avatar, pseudo, rang classé, % du catalogue complété), vitrine de 6 cartes, puis collection. Les boutons d'édition n'apparaissent que si c'est ton propre profil.

| Écran | Route | Données |
| --- | --- | --- |
| Profil | `/u/[username]` | user + 6 `ShowcaseSlot` + stats |
| Collection | `/u/[username]/collection` | `UserCard` groupées par `cardId` avec compteur de doublons |
| Amis | `/friends` | demandes reçues, envoyées, amis acceptés |
| Album | `/collection/album` | tout le catalogue, cartes non possédées en silhouette |

Trois écrans repris de Kyara complètent le tableau : le wiki `/wiki/[anilistId]` (fiche visible en silhouette tant que `Discovery` n'existe pas pour ce joueur, avec rareté, série et chance d'obtention), le classement `/classement` (cartes uniques possédées, rang classé) et `/nouveautes` (personnages ajoutés au dernier import). Kyara autorise aussi les cadeaux entre amis : réutilise le transfert de propriété des enchères, limité aux amis acceptés et à quelques cadeaux par jour pour bloquer le farm.

Amis : une demande crée une `Friendship` en `PENDING` ; l'accepter la passe en `ACCEPTED`. Avant de créer, vérifie qu'aucune ligne n'existe dans l'autre sens (A→B ou B→A). La liste d'amis = les lignes `ACCEPTED` où tu es d'un côté ou de l'autre.

Vitrine : `setShowcase(position, userCardId)` vérifie que la carte t'appartient et est en `COLLECTION`, puis fait un `upsert` sur `[userId, position]`. Comme `userCardId` est unique, une carte ne peut occuper qu'un emplacement. Quand une carte est vendue, supprime son emplacement dans la même transaction.

Collection performante : un `groupBy` sur `cardId` avec `_count`, paginé par 48 cartes, puis un seul `findMany` sur `Card` pour les infos d'affichage. Ne charge jamais toutes les instances d'un coup : un joueur actif en accumule plusieurs milliers en quelques semaines.

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

Clôture : une fonction `settleAuction(id)` fait passer la vente de `ACTIVE` à `SOLD` ou `EXPIRED` avec un `updateMany({ where: { id, status: "ACTIVE" } })` ; si `count` vaut 0, quelqu'un l'a déjà clôturée et on s'arrête. Ensuite : la carte change de propriétaire (ou revient au vendeur), le vendeur reçoit le prix moins 5 %, l'emplacement de vitrine éventuel est supprimé.

Elle est appelée à deux endroits : quand quelqu'un affiche une vente terminée, et par une tâche planifiée qui balaie `status = ACTIVE AND endsAt < now()` (Vercel Cron, ou Upstash QStash si ton offre Vercel limite la fréquence). L'index `[status, endsAt]` rend ce balayage instantané.

Pour la page du marché : liste paginée par curseur, filtres rareté/série/prix, tri « finit bientôt » par défaut. Rafraîchis le prix d'une vente ouverte toutes les 5 s (SWR) ; pas besoin de WebSocket au départ.

## Combat 1v1

Commence par du combat asynchrone résolu par le serveur : chaque joueur choisit une équipe de 3 cartes, le serveur simule le duel en une fois et enregistre le journal, le client le rejoue en animation. Zéro WebSocket, zéro triche possible, et l'adversaire n'a pas besoin d'être en ligne au même moment.

Déroulé :

1. Le challenger choisit 3 cartes et défie un ami (ou lance une partie classée) → `Battle` en `PENDING`, cartes en `status = BATTLE`.
2. L'adversaire accepte en choisissant ses 3 cartes, ou refuse ; sans réponse en 24 h → `EXPIRED`, cartes libérées.
3. À l'acceptation, le serveur tire un `seed`, simule, écrit `log` + `winnerId`, met à jour les points de classement si la partie est classée, verse la récompense, libère les cartes.
4. Les deux joueurs voient le replay depuis `/battle/[id]`.

Règles de simulation :

- Les cartes combattent dans l'ordre choisi ; la plus rapide (`spd`) frappe en premier.
- Une carte à 0 HP est remplacée par la suivante ; la première équipe sans carte perd.
- 3 types en triangle (Force > Technique > Vitesse > Force) : ×1,25 contre le type faible. Ajoute un champ `type` à `Card` si tu le retiens.
- Coup critique : 10 % de chance, ×1,5.
- Limite de 50 tours ; au-delà, l'équipe avec le plus de HP restants gagne.

Dégâts d'une attaque :

```latex
\text{dégâts} = \max\left(1,\ \text{ATK} \times \frac{100}{100 + \text{DEF}} \times \text{type} \times \text{crit} \times \text{alea}_{[0{,}9;\,1{,}1]}\right)
```

Sur téléphone, le choix d'équipe se fait dans une feuille qui monte du bas : la collection filtrée en grille, 3 emplacements fixés en haut, un bouton « Défier » toujours visible. Le replay occupe tout l'écran en portrait, une carte par joueur face à face, avec un bouton pour passer à la fin. Utilise un générateur pseudo-aléatoire initialisé par le `seed` (ex. mulberry32) : la même graine redonne exactement le même combat, ce qui te permet de rejouer et déboguer n'importe quel duel. Le journal stocke une liste d'événements (`attack`, `crit`, `ko`, `switch`) que le client anime.

Récompenses : quelques Zeni pour le gagnant, points de classement selon la section Mode classé, et une limite de 10 combats récompensés par jour pour éviter le farm entre amis. Le combat en temps réel (tour par tour avec choix d'actions) peut venir plus tard avec Pusher/Ably/PartyKit en réutilisant le même moteur.

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
- **Adversaires** : une partie classée affronte l'équipe de défense enregistrée (`defenseTeam`) d'un joueur à ±150 PC, donc personne n'attend que l'autre soit en ligne. Le défenseur gagne ou perd la moitié des points. Les défis entre amis restent non classés, ce qui bloque le farm entre amis.
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

## Boutique, casino et serveur Discord

**Boutique** (`/boutique`). Boosters et bannières vedettes payables en Zeni dès le lancement. Une zone « Packs premium » est prévue pour le paiement par carte via Stripe Checkout, mais reste masquée tant que l'interrupteur admin est coupé (voir Points légaux avant de l'activer). Les articles viennent de `ShopItem` ; chaque achat crée un `Purchase`.

**Casino.** Une tuile et une entrée de menu « Casino » avec l'étiquette « Bientôt », pilotées par l'interrupteur admin `features.casino`. La page `/casino` affiche un simple écran d'attente ; rien d'autre n'est construit pour l'instant.

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

## Panneau d'administration

`/admin` permet à un compte `role = ADMIN` de tout gérer sans redéployer. Pour ça, aucune règle du jeu ne vit dans des constantes : délais, taux, stats de combat et barème du classé se lisent dans la table `GameSetting`, et les constantes du code ne servent que de valeurs par défaut.

| Module | Ce que l'admin peut faire |
| --- | --- |
| Tableau de bord | Joueurs actifs, boosters ouverts, Zeni en circulation, ventes et combats du jour |
| Utilisateurs | Rechercher, voir collection et journal de Zeni, changer pseudo ou rôle, donner/retirer Zeni, cartes ou boosters, remettre à zéro pitié ou PC, bannir/débannir, anonymiser (RGPD) |
| Catalogue | Lancer l'import AniList, modifier rareté, stats ou image d'une carte, la retirer des boosters |
| Boosters | Délai (10 min), stock max (10), cartes par booster (4), taux par rareté, seuil de pitié (250), Zeni de départ (500) |
| Lots | Créer des lots (Zeni + boosters + cartes précises ou tirées dans une rareté), les lier aux missions, au parrainage ou aux fins de saison, les envoyer à un joueur ou à tous |
| Quêtes | Créer, modifier, activer ou désactiver les missions quotidiennes et hebdomadaires : objectif, période, lot |
| Combat | Taille d'équipe (3), multiplicateurs de type (×1,25), critique (10 %, ×1,5), tours max (50), combats récompensés par jour (10) |
| Classé | Seuils et barème de chaque rang, critère d'écrasante (60 %), protection après montée, durée et reset de saison, ouvrir/clôturer une saison, lots de fin de saison |
| Marché | Annuler une vente, taxe (5 %), durées autorisées, ventes simultanées max, délai pour les nouveaux comptes |
| Modération | Avis et bugs, joueurs signalés, journal des actions admin |

| Module ajouté | Ce que l'admin peut faire |
| --- | --- |
| Discord | Activer ou désactiver le modal « Rejoins le serveur », changer le lien d'invitation, le titre, le texte, le déclencheur et la fréquence |
| Fonctionnalités | Interrupteurs : casino (« Bientôt »), boutique, paiement Stripe, classé, marché, cadeaux |
| Boutique | Articles (boosters, packs, bannières), prix en Zeni, prix en euros et id de prix Stripe, dates de disponibilité |
| Boosters spéciaux | Bannières vedettes (cartes mises en avant, pitié vedette à 100, prix, dates), fréquence du doré (tous les 10), chance du divin (1/2 000) |
| Avis | Masquer, épingler sur l'accueil, répondre |

Trois modules de plus pour la conformité : **Pages légales** (éditer chaque page en français et en anglais, publier une nouvelle version, forcer la réacceptation des CGU), **Données personnelles** (traiter les demandes d'export et de suppression, avec historique) et **Traductions** (compléter les champs anglais du contenu et repérer ceux qui manquent).

Mise en place :

- **Accès** : `middleware.ts` redirige `/admin/*` si la session n'est pas admin, et chaque Server Action admin appelle `requireAdmin()`. Ne te fie jamais à un bouton masqué. Le premier admin est désigné par son id Discord dans une variable d'environnement.
- **Réglages** : une ligne `GameSetting` par clé (`booster.intervalMinutes`, `ranked.tiers`…), validée par un schéma Zod propre à la clé avant écriture. Le jeu les lit via `unstable_cache` tagué `settings`, et chaque sauvegarde appelle `revalidateTag("settings")` : effet immédiat sans redéployer.
- **Traçabilité** : chaque action écrit une ligne `AdminLog` (qui, quoi, avant, après). Les dons de Zeni passent aussi par `CoinTransaction` avec la raison `ADMIN`, pour que le journal de l'économie reste juste.
- **Sécurité** : confirmation pour les actions irréversibles, aperçu de l'impact avant de changer un taux (« 1,4 Mythique par jour → … »), et suppression d'un joueur = anonymisation, pas effacement des transactions.
- **Interface** : pensée pour le desktop (tableaux denses, filtres, actions en lot) mais utilisable au téléphone : sous 768 px, chaque ligne de tableau devient une carte empilée avec ses actions dans un menu.

## Pages légales, RGPD et langues

Cinq pages publiques, liées depuis le pied de page et depuis l'inscription, couvrent les obligations d'un site français qui traite des comptes joueurs. Leur texte est éditable dans l'admin, en français et en anglais. Je ne suis pas juriste : fais relire ces textes avant l'ouverture publique.

| Page | Route | Contenu minimum |
| --- | --- | --- |
| Mentions légales | `/mentions-legales` | Éditeur (un particulier peut rester anonyme s'il a donné son identité à l'hébergeur), contact, directeur de publication, hébergeur (Vercel) et adresse |
| Politique de confidentialité | `/confidentialite` | Responsable du traitement, données collectées (pseudo, e-mail, avatar et id Discord, adresse IP, journaux), finalités et base légale de chacune, durées de conservation, sous-traitants (Vercel, Neon, Upstash, Discord, Stripe plus tard), transferts hors UE, droits et comment les exercer, réclamation à la CNIL |
| Politique cookies | `/cookies` | Liste des cookies et stockages locaux, rôle, durée, et lien pour modifier son choix |
| Conditions d'utilisation | `/cgu` | Compte (un par personne), règles de jeu, Zeni et cartes sans valeur monétaire, sanctions et contestation, propriété des personnages, responsabilité |
| Conditions de vente | `/cgv` | Seulement quand Stripe sera branché : prix, paiement, renonciation au droit de rétractation pour un contenu numérique livré immédiatement, remboursements |

Droits des joueurs, dans un onglet « Mes données » du Compte :

- **Télécharger mes données** : un fichier JSON avec le profil, les cartes, le journal de Zeni, les combats et les avis (droit d'accès et de portabilité).
- **Modifier** pseudo, langue et préférences (droit de rectification).
- **Supprimer mon compte** : anonymisation sous 30 jours (pseudo remplacé, e-mail et id Discord effacés), les transactions restent pour l'intégrité de l'économie mais ne pointent plus vers une personne.
- **Gérer les cookies** : rouvre le bandeau.

Cookies : au départ, n'utilise que ce qui est strictement nécessaire (cookie de session, protection anti-abus) et du stockage local pour la langue et le son. Ces usages sont exemptés de consentement, donc pas de bandeau à afficher, juste la page d'information. Dès que tu ajoutes de la mesure d'audience non exemptée, de la pub ou des intégrations tierces qui déposent des traceurs, il faut un bandeau : « Accepter » et « Refuser » aussi visibles l'un que l'autre, un choix « Personnaliser », rien de déposé avant le choix, et le choix redemandé au bout de 6 mois.

Âge : en France, un mineur de moins de 15 ans a besoin de l'accord d'un parent pour ce type de service. Avec des boosters aléatoires et un futur casino, le plus simple est de demander la date de naissance à l'inscription et d'exiger 15 ans minimum (18 ans pour le casino et les achats).

Acceptation des CGU : chaque page légale porte un numéro de version. Le joueur accepte la version en cours à l'inscription ; si tu changes les CGU, il voit un écran d'acceptation à sa prochaine visite (`User.termsVersion`).

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

- Un seul `PrismaClient` partagé (singleton dans `lib/prisma.ts`), branché sur l'adaptateur Neon et l'URL poolée.
- Pages en Server Components ; seuls les éléments interactifs (ouverture, enchère, timer) sont des Client Components.
- Catalogue et pages de cartes en cache (`revalidateTag` à l'ajout de cartes).
- Images de cartes en WebP, deux tailles (vignette \~300 px, détail \~800 px), via CDN.
- Pagination par curseur partout (collection, marché, historique).

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
| Abus et robots | Upstash Ratelimit sur l'ouverture, les enchères, les défis, l'inscription et les formulaires ; protection anti-robots et pare-feu Vercel. |
| Secrets | Variables d'environnement côté serveur uniquement (jamais `NEXT_PUBLIC_`), modules marqués `server-only`, messages d'erreur génériques côté client, détails dans les logs. |
| Dépendances | `npm audit` en CI, Dependabot ou Renovate, versions verrouillées. |

Pour l'admin : rôle vérifié côté serveur à chaque action, session courte, journal `AdminLog` de toutes les écritures, et confirmation pour les actions irréversibles.

## Fluidité et animations

Objectif : un téléphone milieu de gamme en 4G charge une page en moins de 2,5 s (LCP), répond à un appui en moins de 200 ms (INP), ne fait pas sauter la page (CLS < 0,1) et anime à 60 images par seconde.

- **Rendu** : pages en Server Components avec streaming (`loading.tsx` et `Suspense`), squelettes de chargement aux couleurs Yoru, pages publiques (wiki, raretés, classement) mises en cache et régénérées périodiquement.
- **Navigation** : préchargement des liens (`next/link`) et transitions entre pages avec l'API View Transitions ; la carte touchée s'agrandit en fiche au lieu de recharger la page.
- **Réponse immédiate** : mises à jour optimistes (`useOptimistic`) pour les enchères, la vitrine et les amis ; à l'ouverture d'un booster, le cordon commence à se dénouer pendant l'appel serveur et les cartes se révèlent dès la réponse.
- **Animations** : uniquement `transform` et `opacity`, ressorts courts (200–400 ms), Motion chargé en version légère (`LazyMotion`) ; l'effet holo met à jour des variables CSS dans `requestAnimationFrame` et s'arrête hors de l'écran. Tout est adouci si `prefers-reduced-motion`.
- **Images** : `next/image` en AVIF/WebP aux bonnes tailles, couleur dominante en fond pendant le chargement, priorité seulement aux images visibles.
- **Polices** : `next/font`, avec des sous-ensembles pour les polices japonaises (Yuji Syuku ne sert qu'aux quelques kanji des sceaux et emblèmes), sinon elles pèsent plusieurs mégaoctets.
- **Listes longues** : collection et marché virtualisés (TanStack Virtual) au-delà de quelques centaines de cartes.
- **Poids du JavaScript** : composants client petits, imports dynamiques pour le replay de combat, l'admin et les sons ; budget suivi à chaque build.
- **Mesure** : Vercel Speed Insights en production et Lighthouse en CI, avec un seuil qui bloque une régression.

## Schéma Prisma

Le point central : `Card` est le modèle (le personnage, ses stats, sa rareté) et `UserCard` est l'exemplaire possédé. C'est l'exemplaire qui se vend, se met en vitrine et combat. Les modèles Auth.js (`Account`, `Session`, `VerificationToken`) s'ajoutent tels que fournis par l'adaptateur.

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"] // inutile si ta version de Prisma l'a déjà stabilisé
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")  // URL poolée Neon
  directUrl = env("DIRECT_URL")    // URL directe, pour migrate
}

enum Rarity { COMMON UNCOMMON RARE EPIC LEGENDARY MYTHIC }
enum Role { USER ADMIN }
enum CardStatus { COLLECTION AUCTION BATTLE }
enum FriendStatus { PENDING ACCEPTED }
enum AuctionStatus { ACTIVE SOLD EXPIRED CANCELLED }
enum BattleStatus { PENDING FINISHED DECLINED EXPIRED }
enum CoinReason { SIGNUP BID_HOLD BID_REFUND SALE FEE DISSOLVE BATTLE_WIN DAILY MISSION REFERRAL ADMIN SHOP }

model User {
  id            String   @id @default(cuid())
  username      String   @unique
  email         String?  @unique
  image         String?
  coins         Int      @default(500) // solde en Zeni
  boosterStock  Int      @default(10)
  boosterAnchor DateTime @default(now()) // début du cycle de 10 min en cours
  rankPoints    Int      @default(0)   // points de classement (mode classé)
  defenseTeam   String[]               // 3 UserCard qui défendent en classé
  role          Role     @default(USER)
  bannedAt      DateTime?
  isGuest       Boolean  @default(true)
  pityCount     Int      @default(0)  // boosters ouverts depuis la dernière Mythique
  standardCount Int      @default(0)  // pour le booster doré (tous les 10)
  bannerPity    Json     @default("{}") // { boosterTypeId: boosters sans vedette }
  discordJoinedAt DateTime?          // a cliqué sur « Rejoindre le serveur »
  locale        String   @default("fr") // fr | en
  birthDate     DateTime?              // contrôle d'âge à l'inscription
  termsVersion  Int?                   // version des CGU acceptée
  deletionRequestedAt DateTime?        // suppression RGPD en attente
  referralCode  String   @unique @default(cuid())
  referredById  String?
  createdAt     DateTime @default(now())

  cards        UserCard[]
  showcase     ShowcaseSlot[]
  sentFriends  Friendship[] @relation("requester")
  recvFriends  Friendship[] @relation("addressee")
  auctions     Auction[]    @relation("seller")
  bids         Bid[]
  ledger       CoinTransaction[]
  // + relations Auth.js
}

model Series {
  id    String @id @default(cuid())
  name  String
  slug  String @unique
  cards Card[]
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
  showcase   ShowcaseSlot?
  auctions   Auction[]

  @@index([ownerId, cardId])
  @@index([ownerId, status])
}

model ShowcaseSlot {
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  position   Int      // 1 à 4
  userCardId String   @unique
  userCard   UserCard @relation(fields: [userCardId], references: [id], onDelete: Cascade)

  @@id([userId, position])
}

model Friendship {
  id          String       @id @default(cuid())
  requesterId String
  addresseeId String
  requester   User         @relation("requester", fields: [requesterId], references: [id])
  addressee   User         @relation("addressee", fields: [addresseeId], references: [id])
  status      FriendStatus @default(PENDING)
  createdAt   DateTime     @default(now())

  @@unique([requesterId, addresseeId])
  @@index([addresseeId, status])
}

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
  type      String   // OUTBID | SOLD | BATTLE_CHALLENGE | FRIEND_REQUEST
  payload   Json
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

model Battle {
  id             String       @id @default(cuid())
  challengerId   String
  opponentId     String
  challengerTeam String[]     // ids de UserCard
  opponentTeam   String[]
  status         BattleStatus @default(PENDING)
  seed           Int
  winnerId       String?
  ranked         Boolean      @default(false)
  crushing       Boolean      @default(false) // victoire écrasante
  pcDelta        Int?                         // points gagnés/perdus par le challenger
  log            Json?
  createdAt      DateTime     @default(now())

  @@index([opponentId, status])
  @@index([challengerId, createdAt])
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
5. **Collection et profil** — collection, fiche carte, recyclage, vitrine, profil public.
6. **Social** — amis, cadeaux, notifications.
7. **Économie** — Zeni, journal `CoinTransaction`, missions, parrainage, boutique en Zeni.
8. **Hôtel des ventes** — ventes, enchères, clôture planifiée. Avant la mise en ligne, un test lance 50 enchères simultanées et vérifie que la somme des soldes ne bouge pas.
9. **Combat** — moteur avec seed, défis, replay ; puis mode classé et saisons.
10. **Conformité et finitions** — pages légales, « Mes données », contrôle d'âge, modal Discord (désactivé), tuile Casino « Bientôt », PWA, admin complet, tests sur un vrai téléphone en 375 px.

Hors de ce plan : Stripe et le casino, après un avis juridique.

## Sources

- [Kyara, accueil](https://kyara.games/) et [plan du site](https://kyara.games/sitemap.xml), plus tes captures d'écran (accueil, récap d'ouverture, raretés)
- Fiches Kyara : [Gojo #1](https://kyara.games/wiki/127691), [Luffy #3](https://kyara.games/wiki/40), [Kaiji #500](https://kyara.games/wiki/5578), [Konata #501](https://kyara.games/wiki/2169)
- [Kyara, raretés](https://kyara.games/raretes) et [règles](https://kyara.games/regles)
- [AniList, limites de l'API](https://docs.anilist.co/guide/rate-limiting)
- [Stripe, activités interdites](https://stripe.com/legal/restricted-businesses)
