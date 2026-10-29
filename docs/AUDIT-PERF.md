# Audit performance et requêtes — 29 octobre 2026

**Périmètre.** Tout le site, sur le code de la branche `combat-arenes` (identique à `main` hors combat).
La production tourne sur le VPS OVH : pm2 `next start` et PostgreSQL 17 en Docker sur la même machine.

**Méthode.** Le code a été lu en trois passes : requêtes SQL, coût serveur d'une page, réseau et rendu
dans le navigateur. Un build local a servi à peser le JavaScript, avec une adresse de base factice pour
ne jamais toucher la prod. Les constats graves ont été revérifiés dans le code.

**Aucune mesure en production** : l'accès en lecture au VPS et à la base a été bloqué par les garde-fous
de l'outil. Les volumes ci-dessous sont des ordres de grandeur tirés du code. Les commandes pour les
confirmer sont à la fin.

## Suivi des corrections (branche `perf-audit`)

Quatre commits, un par lot. Chaque lot est passé par le lint, le typecheck et les tests. Les tests
PGlite appliquent toutes les migrations, y compris la nouvelle.

| # | État | Ce qui a été fait, ou ce qui reste |
| --- | --- | --- |
| C1 | Corrigé | `Link` sans préchargement par défaut (`i18n/navigation.tsx`), `prefetch` explicite au cas par cas. |
| C2 | **Sur le VPS** | Crontab prête (`deploy/crontab.example`), checklist de mise en production mise à jour. À installer après `crontab -l`. |
| E1 | Corrigé | Pool à 15, inactivité 5 min, `statement_timeout` 30 s, `idle_in_transaction_session_timeout` 65 s. |
| E2 | Corrigé | Une seule lecture par vue tant que la saison court, verrou à l'échéance seulement (test unitaire ajouté). |
| E3 | Corrigé, **Ably à vérifier** | Sondage ralenti pendant son propre tour, balayage au plus une fois toutes les 30 s par joueur. Reste à vérifier `ABLY_API_KEY` sur le VPS. |
| E4 | Corrigé, **migration à appliquer** | Migration `20261029200000_index_cles_etrangeres` : 5 clés étrangères et 3 index BRIN. SQL identique à celui que Prisma déduit du schéma. |
| E5 | Corrigé en partie | Les doubles rendus sont retirés. Le `refresh()` après une ouverture de booster est gardé : l'en-tête (stock, solde) est rendu côté serveur, et le remplacer demande un état client partagé. |
| M1 | Corrigé | Compteur `notif-sweep` en mémoire. |
| M2 | Corrigé | Joueurs bloqués lus d'abord, amis lus par les index de Friendship. À confirmer par `EXPLAIN ANALYZE` en prod. |
| M3 | Corrigé en partie | En-tête en deux vagues, accueil en trois au lieu de cinq, défi du hub combat dans la même vague. Pas de Suspense sur l'en-tête. `relationJoins` n'est pas activé : c'est un changement global de Prisma, à essayer sur une base de test. |
| M4 | Corrigé | Table des réglages gardée 2 s par processus et oubliée à chaque sauvegarde de l'admin, règles dédupliquées par rendu. |
| M5 | Corrigé | Pools d'affichage en mémoire (lecture seule), `focusCardIds` n'est plus envoyé au client. |
| M6 | Corrigé | Logo en WebP (714 → 26 Ko), uploads en WebP 720 px, avatars Discord à la taille affichée, cache d'une semaine sur `public/`. |
| M7 | **Non résolu** (mesuré) | Les découpages faits (`lib/text/note-schema.ts`, `lib/profile/badges.ts`) ne suffisent pas : le build local montre encore les 31 Ko gzip de Zod sur chaque page. `Fuda` valide le JSON d'apparence des cartes avec Zod côté navigateur (`resolveAppearance` → `parseAppearance`, `lib/catalog/appearance.ts`), et une dizaine de modules partagés mêlent schémas et constantes (`lib/boosters/types.ts`, `lib/catalog/definitions.ts`, `lib/discord/join-modal.ts`…). Il faut une tâche à part : apparence validée côté serveur et transmise déjà résolue, puis schémas séparés des constantes. |
| M8 | Corrigé | L'encens tient sa propre horloge, l'échéance est réclamée par un seul délai. |
| M9 | Allégé | Plus d'écriture inutile ni d'écoute du gyroscope sans effet. L'inclinaison des grilles est gardée (choix visuel). |
| M10 | Non fait | Après E3 et M1, passer les sondages en `GET` ne gagnerait plus grand-chose pour une refonte risquée. |
| M11 | Corrigé | Tableau de bord gardé 60 s, BRIN sur les dates. |
| F1, F2, F4–F8 | Corrigés | Clé de cache des tirages, image de partage, préchargement du service worker, animations hors écran, lectures ciblées (profil, wiki), horloges recalées, sondage unique au retour, registre des raretés. |
| F3, F9 | Laissés | `htmlLimitedBots` reste un arbitrage SEO. Les restes de Vercel sont sans effet sur le VPS. |

**Autre source de requêtes :** si `ADS_ENABLED=1` sur le VPS, AdSense (`app/[locale]/layout.tsx`, `lib/ads/config.ts`)
charge son script et ses annonces sur chaque page. Ces requêtes partent vers Google, pas vers le VPS, mais
elles s'ajoutent à l'onglet Réseau et au poids des pages.

**Pour mettre en production, dans cet ordre :**
1. Fusionner `perf-audit`.
2. Sur le VPS : `git pull`, `npm ci`, `npx prisma migrate deploy`, `npm run build`, **puis** `pm2 restart`.
   La migration passe avant le redémarrage.
3. Installer la crontab (`deploy/crontab.example`).
4. Vérifier `ABLY_API_KEY`.
5. Relancer les mesures de la fin du rapport.

## En bref

1. **Le préchargement des liens génère la plupart des requêtes.**
   - Sur 148 `<Link>`, 130 gardent le prefetch automatique de Next.
   - Toutes les pages sont dynamiques (nonce CSP). Chaque lien qui approche de l'écran coûte donc jusqu'à
     deux requêtes rendues par le serveur.
   - Ordres de grandeur : 30 requêtes pour le pied de page, environ 100 en ouvrant la collection, de 60
     à 110 sur le classement, chacune avec une requête SQL.
   - C'est très probablement le « nombre énorme de requêtes » visible dans l'onglet Réseau.
2. **Plusieurs réglages hérités de Vercel et Supabase ne collent plus au VPS.**
   - Les crons de `vercel.json` ne sont appelés par personne, sauf crontab sur le VPS.
   - Le pool reste à 5 connexions.
   - Le temps réel est peut-être absent (clé Ably à vérifier).
   - Les images sont servies sans optimisation.
3. **Chaque rendu coûte plus qu'il ne devrait.**
   - 4 requêtes séquentielles avant chaque page.
   - Plusieurs actions déclenchent deux rendus complets.
   - Un verrou de saison est pris à chaque vue de `/combat` et `/classement`.
   - Le combat sonde toutes les 3 secondes.

## Synthèse

| # | Sévérité | Point | Effort |
| --- | --- | --- | --- |
| C1 | Critique | Tempête de prefetch des `<Link>` | ½ jour |
| C2 | Critique (à vérifier) | Crons jamais appelés sur le VPS : RGPD, purge des invités, ménage | 1 h |
| E1 | Élevé | Pool `pg` de 5 connexions, sans délai maximal de requête | 1 h |
| E2 | Élevé | Verrou `FOR UPDATE` sur la saison à chaque vue | 1 h |
| E3 | Élevé (critique sans Ably) | Sondage du combat toutes les 3 s, environ 6 requêtes SQL chacun | ½ à 2 jours |
| E4 | Élevé | Clés étrangères sans index : parcours complet à chaque suppression | 1 h + migration |
| E5 | Élevé | Doubles rendus complets après des actions, `refresh()` après chaque booster | ½ jour |
| M1 | Modéré | La cloche écrit en base à chaque sondage | 10 min |
| M2 | Modéré | Notifications et amis : sous-requêtes sur toute la table User (à confirmer) | ½ jour |
| M3 | Modéré | 4 requêtes séquentielles par page, en-tête hors Suspense | ½ jour |
| M4 | Modéré | Réglages relus et revalidés sans mémo, environ 80 fois par vue d'accueil | 2 h |
| M5 | Modéré | Accueil : pools désérialisés à chaque vue, props trop lourdes | ½ jour |
| M6 | Modéré | Images : uploads bruts, logo de 714 Ko, cache `max-age=0` | ½ jour |
| M7 | Modéré | Zod (31 Ko gzip) envoyé sur toutes les pages | 1 à 2 jours (voir le suivi) |
| M8 | Modéré | Plateau de combat re-rendu 4 fois par seconde | 1 h (jalon 3) |
| M9 | Modéré | Inclinaison gyroscope sur toutes les cartes des grilles | 1 h |
| M10 | Modéré | Sondages en Server Actions, en file avec les actions du joueur | 1 jour |
| M11 | Modéré | `/admin` : environ 18 requêtes, dont un agrégat sur tout le journal des Zeni | 2 h |
| F1–F9 | Faible | Cache des tirages, image de partage, métadonnées bloquantes, service worker, etc. | — |

---

## Critique

### C1. Tempête de prefetch des `<Link>`

**Constat.**
- Seuls les 18 liens de l'en-tête et de la navigation ont `prefetch={false}`. Les 130 autres gardent le
  prefetch automatique.
- En production, Next 16.4 précharge tout lien à moins de 200 px de l'écran, quatre requêtes à la fois.
- Toutes les routes sont dynamiques, à cause du nonce CSP (`next.config.ts`, `proxy.ts`). Chaque URL coûte
  donc une requête d'arbre de route, puis une requête RSC. Celle-ci repasse par `proxy.ts`, exécute
  `generateMetadata` et les segments jusqu'au `loading.tsx`.

**Où :**
- **Collection** (`components/collection/CollectionGrid.tsx:26`, `<Link href={href} scroll={false}>`).
  - La fiche est une route interceptée (`@sheet/(.)[anilistId]`) : deux requêtes par carte.
  - Le gain est presque nul : l'ouverture de la fiche refait une requête complète.
- **Profils** : `components/social/PlayerRow.tsx:23` (classement, amis) et `components/home/TopCollectors.tsx:38,64`.
  Chaque prefetch d'un `/u/[name]` interroge la base (`findProfileOwner`).
- **Pied de page** (`components/PageShell.tsx`, `FOOTER_LINKS` et `LEGAL_SLUGS`) : 15 liens sur toutes les pages.
- **Autres** :
  - grilles et vignettes : `components/wiki/WikiGrid.tsx:43`, `components/market/AuctionTile.tsx:15` ;
  - onglets du marché ;
  - `components/opening/RecapActionBar.tsx` et `components/boosters/OpenLink.tsx` : nouvelle URL à chaque
    changement de booster ou de ×N.
- **Aggravant** : chaque `router.refresh()` vide ce cache, et tous les liens visibles sont préchargés à nouveau.

**Impact (ordre de grandeur) :**

| Page | Requêtes de prefetch |
| --- | --- |
| Collection | ~100 au chargement, ~100 de plus par écran en défilant |
| Classement | 60 à 110, chacune avec une requête SQL |
| Accueil | 35 à 40 en bas de page |
| Marché | 30 à 60 |

**Correction.**
1. Un `Link` maison avec `prefetch={false}` par défaut. Le fichier devient `i18n/navigation.tsx` ; les
   imports `@/i18n/navigation` ne changent pas.
   ```tsx
   const nav = createNavigation(routing);
   export const { redirect, usePathname, useRouter, getPathname } = nav;
   export function Link(props: ComponentProps<typeof nav.Link>) {
     return <nav.Link prefetch={false} {...props} />;
   }
   ```
2. Le prefetch reste explicite (`prefetch`) sur deux ou trois boutons d'action : « Ouvrir », « Combattre ».

Les clics restent rapides : le `loading.tsx` de chaque route s'affiche aussitôt.

### C2. Crons jamais appelés sur le VPS (à vérifier en premier)

**Constat.**
- Les trois tâches planifiées sont déclarées dans `vercel.json`, que seul Vercel exécute :
  `/api/cron/market` à 4 h, `/api/cron/battle` à 4 h 15, `/api/cron/accounts` à 4 h 30.
- `server/cron-auth.ts:5` prévoit une crontab sur le VPS, mais le dépôt n'en contient aucune, ni timer
  systemd ni tâche pm2.
- Le VPS a forcément un `CRON_SECRET`, sans quoi l'app refuse de démarrer (`server/env.ts:48-50`). Cela ne
  prouve pas qu'un cron appelle les routes.

**Ce qui ne se fait plus si rien ne les appelle** (`app/api/cron/accounts/route.ts:35-46`) :
- **Effacements RGPD arrivés à échéance** (`processDueDeletionsWith`) : c'est un **problème légal**, pas seulement de performance.
- **Purge des invités inactifs.** Chaque visiteur crée un User, une Session, des UserCard, des
  BoosterOpening et des CoinTransaction qui ne sont jamais supprimés. Les tables grossissent sans fin,
  et les requêtes qui parcourent User ralentissent avec elles (M2).
- **Purge de RateLimit, des vieux messages de chat et des vieux tirages.**
- **Clôture des enchères et combats échus.** La cloche la rattrape, mais rien ne la fait si les deux
  joueurs sont partis.

**Correction (sur le VPS, si `crontab -l` ne montre rien) :**
1. Le secret va dans `~/.config/kiraku/cron-secret`, en `chmod 600`, avec la même valeur que dans l'env de l'app.
2. Puis dans `crontab -e` :
   ```cron
   0 4 * * *  curl -fsS -H "Authorization: Bearer $(cat $HOME/.config/kiraku/cron-secret)" http://127.0.0.1:3000/api/cron/market   >/dev/null
   15 4 * * * curl -fsS -H "Authorization: Bearer $(cat $HOME/.config/kiraku/cron-secret)" http://127.0.0.1:3000/api/cron/battle   >/dev/null
   30 4 * * * curl -fsS -H "Authorization: Bearer $(cat $HOME/.config/kiraku/cron-secret)" http://127.0.0.1:3000/api/cron/accounts >/dev/null
   ```
- Adapter le port à celui de pm2.
- Le premier passage de la purge peut être long : la surveiller dans `pm2 logs`.

---

## Élevé

### E1. Pool `pg` de 5 connexions, sans délai maximal de requête

**Constat.** `server/pg-adapter.ts:57` : `{ max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000 }`.
Ce réglage date de Supabase (60 connexions partagées entre toutes les instances Vercel). Sur le VPS, la
base est locale et réservée à l'app.

**Impact.**
- **Demande en connexions :** un rendu ordinaire lance 3 à 6 requêtes en parallèle, un profil environ 12,
  `/admin` environ 18.
- **Connexions tenues longtemps :** une transaction interactive garde sa connexion pendant tous ses allers-retours :
  - une ouverture de booster : 12 à 14 allers-retours ;
  - un recyclage : jusqu'à 20 s ;
  - une clôture de saison : jusqu'à 60 s.
- **Conséquence :** deux rendus lourds, ou une requête lente, font attendre tous les joueurs. Au bout de 10 s,
  les requêtes échouent.
- **Reconnexions :** avec 10 s d'inactivité, les connexions se ferment à chaque creux. Chaque reprise coûte
  un nouveau processus Postgres et une authentification.

**Correction.**
```ts
const POOL_OPTIONS = {
  max: 15,                       // (instances pm2 × max) < max_connections de Postgres (100 par défaut)
  idleTimeoutMillis: 300_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 15_000,     // une requête folle ne bloque plus tout le monde
  idle_in_transaction_session_timeout: 30_000,
} satisfies pg.PoolConfig;
```
- Option : un petit pool séparé pour `/admin` et les crons.
- Agrandir le pool sans traiter E2, E3 et M3 ne suffira pas.
- Le commentaire Supabase et `attachDatabasePool` (`server/db.ts`), sans effet hors de Vercel, peuvent partir.

### E2. Verrou de saison à chaque vue de `/combat` et `/classement`

**Constat.**
- `ensureSeason` (`server/ranked/queries.ts:24-28`) appelle `rollSeasonWith`
  (`server/ranked/ranked-core.ts:195-200`) à chaque appel.
- Celui-ci ouvre une transaction avec
  `SELECT … FROM "Season" WHERE "closedAt" IS NULL … FOR UPDATE`, même quand la saison n'est pas terminée.
- Appelé par le hub combat et par `/classement`, une page publique (`app/[locale]/classement/page.tsx:107`).

**Impact.**
- Tous les visiteurs simultanés font la queue sur la même ligne, chacun en tenant une connexion du pool.
- À la fin d'une saison, le premier visiteur exécute l'UPDATE de masse sur User, pendant que les autres attendent.

**Correction.**
- Lire la saison ouverte (en cache, avec son `endsAt`) et n'ouvrir la transaction verrouillée que si `endsAt <= now`.
- Le cron `battle` clôt déjà la saison (`app/api/cron/battle/route.ts:24`). L'affichage ne sert plus que
  de filet entre l'échéance et le passage du cron.

### E3. Sondage du combat toutes les 3 secondes

**Constat.**
- `components/battle/BattleBoard.tsx:102-108` : `usePoll` toutes les `battle.pollSeconds` = 3 s
  (`lib/settings/defaults.ts:460`), sans ralentissement progressif. `useHoldAwake` empêche toute pause pour inactivité.
- Il ne passe à 30 s que si le canal Ably de la partie est attaché.
- **Le `.env` local n'a pas de `ABLY_API_KEY`.** Si celui du VPS n'en a pas non plus, aucun écran n'est en
  temps réel : tout le site sonde à son rythme de base.
- **Coût d'un sondage** (`battleSinceAction`, `server/actions/battle.ts:319-329`) : environ 6 requêtes SQL
  et 33 lectures de réglages.
  - la session ;
  - `sweepStaleWith`, trois SELECT (`server/battle/battle-core.ts:733-767`) ;
  - la partie ;
  - `battleCtx`.

**Impact sans Ably.** 20 requêtes par minute et par joueur, environ 120 requêtes SQL par minute, et
environ 240 par partie à deux joueurs. Les Server Actions passent en file (voir M10) : un sondage en cours
retarde le coup que le joueur vient de jouer.

**Correction, par ordre de facilité :**
1. **Tout de suite, sans code :** monter `battle.pollSeconds` à 5 dans `/admin` (réglage `GameSetting`).
2. Vérifier `ABLY_API_KEY` sur le VPS. Avec Ably, le combat passe à une requête toutes les 30 s.
3. Sortir `sweepBattlesFor` du sondage : le garder à l'affichage de la page et dans `claimTimeout`.
4. Ralentir le sondage pendant le tour adverse (backoff).
5. Le jalon 3 de la refonte du combat touche à ce plateau : y faire ces changements.

### E4. Clés étrangères sans index : un parcours complet de table par ligne supprimée

**Constat (vérifié dans le schéma et les migrations).**
- `Auction.userCardId` est en `ON DELETE SET NULL`. Son seul index est partiel, `WHERE "status" = 'ACTIVE'`
  (`prisma/migrations/20261015120000_etape_8_marche/migration.sql`), et le trigger de la clé étrangère ne
  peut pas s'en servir.
- `Notification.actorId` (CASCADE), `ChatMessage.senderId` (CASCADE) et `LotGrant.adminId` (RESTRICT)
  n'ont aucun index.

**Impact.** Chaque suppression parcourt toute la table liée.
- « Recycler tous les doublons » supprime des milliers d'exemplaires dans une transaction limitée à 20 s
  (`server/collection/recycle-core.ts`) : un parcours de Auction par exemplaire.
- La purge des invités et les suppressions de comptes parcourent Notification, ChatMessage et LotGrant
  pour chaque utilisateur.
- Plus les tables grossissent, plus c'est lent, jusqu'au dépassement de délai.

**Correction** : une migration nommée (`index_cles_etrangeres`), créée sur une base de test et appliquée
par `migrate deploy` **avant** le redémarrage pm2.
```prisma
model Auction      { @@index([userCardId]) }
model Notification { @@index([actorId]) }
model ChatMessage  { @@index([senderId]) }
model LotGrant     { @@index([adminId]) }
```

### E5. Doubles rendus complets après des actions

**Constat.** `refresh()` côté serveur et `router.refresh()` côté client rejouent chacun tout le rendu :
- layout et page ;
- les requêtes de l'en-tête ;
- environ 30 Ko gzip de messages i18n ;
- la remise à zéro du cache de prefetch (C1).

Plusieurs flux font les deux à la suite :

| Action serveur | Composant client |
| --- | --- |
| `server/actions/market.ts:176` | `components/market/AuctionPanel.tsx:113-116` |
| `server/actions/listings.ts:114,139` | `components/market/listings/MyExchanges.tsx:101-103,179-181` |
| `server/actions/profile.ts:67` | `components/profile/ProfileCustomizeSheet.tsx:90-95` |
| `server/actions/notifications.ts:39` | `components/social/NotificationList.tsx:174-175` |
| `ensureGuest` pose déjà un cookie (`server/actions/auth.ts:40`), ce qui re-rend la page | `components/GuestBootstrap.tsx:23` |

Par ailleurs, `server/actions/boosters.ts:108,172` fait un `refresh()` après chaque ouverture, rien que
pour mettre à jour l'en-tête.

**Correction.**
- Supprimer les `router.refresh()` redondants côté client.
- Pour les boosters, renvoyer le nouvel état (stock, solde) dans la réponse de l'action et mettre l'en-tête
  à jour côté client. `StockEnso` le calcule déjà.

---

## Modéré

### M1. La cloche écrit en base à chaque sondage

**Constat.**
- `server/actions/notifications.ts:118` : `rateLimit("notif-sweep:…")` ne sert qu'à espacer le ménage à
  une fois toutes les 5 min.
- Il utilise le stockage par défaut, la base : un `INSERT … ON CONFLICT` à chaque sondage, en plus des 7
  à 11 requêtes de lecture.

**Correction.**
- `rateLimit(..., { store: "memory" })`, comme `notif-poll` juste au-dessus. Le ménage est idempotent.
- Fusionner les trois lectures de Notification.

### M2. Notifications et amis : sous-requêtes sur toute la table User (à confirmer par `EXPLAIN ANALYZE`)

**Constat.**
- **Notifications** : `server/social/queries.ts:167-170`,
  `OR: [{ actorId: null }, { actor: { blockedBy: { none: { blockerId } } } }]`. Sans `relationJoins`, Prisma
  produit un `IN (SELECT …)`. Sous un `OR`, Postgres l'évalue sur toute la table.
- **Amis** : `listFriends` (`server/social/queries.ts:65-77`), un `OR` de deux `some` sur User. Aucun
  index ne peut servir.
- Ces requêtes passent à chaque vue de `/notifications` et `/amis`, à chaque sondage de la cloche qui
  ramène du nouveau, et à chaque push.
- Avec les invités jamais purgés (C2), User grossit sans fin.

**Correction.**
- **Notifications** : lire d'abord les ids bloqués par le lecteur (presque toujours aucun), puis filtrer en
  `actorId: { notIn: ids }` seulement s'il y en a.
- **Amis** : lire `Friendship` par ses index, puis `user.findMany({ where: { id: { in } } })`.

### M3. Coût de base de chaque page

**Constat.**
- Le layout fait 4 allers-retours séquentiels avant le premier octet :
  - la session jointe à l'utilisateur (`server/auth-adapter.ts:101`) ;
  - l'utilisateur et son décor (`server/user.ts:14`) ;
  - le compteur de la cloche ;
  - le compteur du chat (`components/layout/AppHeader.tsx:36-53`).
- L'en-tête est hors Suspense : ces 4 requêtes retardent le premier octet.
- Prisma 7 tourne sans `relationJoins` : chaque relation imbriquée part en requête séparée.

| Page | Appels Prisma, layout compris |
| --- | --- |
| Accueil | ~10 |
| Marché | ~9 |
| Collection | ~7 |
| Hub combat | ~15 |
| Profil | ~12, et 18 sur son propre profil |

- L'accueil enchaîne 5 vagues de requêtes (`app/[locale]/page.tsx:81,106,116,123,148`), le hub combat au
  moins 5 allers-retours (`app/[locale]/combat/page.tsx:56-66`).

**Correction.**
- Une seule lecture `session.findUnique({ include: { user: … } })` à partir du cookie pour les lectures,
  ou activer `relationJoins`.
- Compteurs de l'en-tête sous `<Suspense>`.
- Lancer ensemble les vagues indépendantes (`Promise.all`).

### M4. Réglages relus et revalidés sans mémo

**Constat.** Chaque `getSetting` (`server/settings.ts:10-22`) refait le même parcours : `unstable_cache`,
puis `JSON.parse` de toute la table, puis Zod.
- `getBoosterRules` (14 clés) n'est pas sous `cache()` et tourne 4 fois par vue de l'accueil
  (`AppHeader.tsx:41`, `page.tsx:58,85`, `server/boosters/sealed.ts:11`).
- Résultat : environ 80 lectures par vue de l'accueil, et 33 par sondage de combat.
- Ce n'est pas du SQL (la table est en cache), mais c'est du CPU à chaque requête sur un seul processus.

**Correction.**
- `cache()` de React sur le chargement de la table, ainsi que sur `getBoosterRules`, `getBattleRules`,
  `getRankedRules` et `battleCtx`.
- Dans les Server Actions, `cache()` ne déduplique pas : un mémo de module de quelques secondes.

### M5. Accueil : pools désérialisés à chaque vue, props trop lourdes

**Constat.**
- **Pools :** dès que le joueur a un souhait, chaque offre ouvrable (une vingtaine) appelle `getBoosterPool`
  (`server/boosters/pools.ts:130-135`), qui relit le pool entier depuis le cache, juste pour compter les
  souhaits (`lib/boosters/panel.ts:73-78`). Le pool standard couvre tout le catalogue (~6 700 ids).
- **Props :** l'accueil envoie au client les types de booster complets, `focusCardIds` compris
  (`app/[locale]/page.tsx:149-177,228`). Le client ne lit que `featuredCardIds.length`.
- **Répétition :** le tout repart à chaque `router.refresh()` du compte à rebours, toutes les 10 min
  (`components/boosters/useBoosterClock.ts:34-44`).

**Correction.**
- Un `Map<slug:stamp, Set<string>>` en mémoire du processus pour les pools, ou un seul `COUNT` SQL.
- N'envoyer au client que les champs utiles, comme le fait déjà `ouvrir/[slug]/page.tsx`.

### M6. Images

**Constat.**
- **Logo de l'accueil :** `components/ArcadeBanner.tsx` affiche le PNG `public/brand/jjk-arcade-logo.png`,
  836 × 511 et **714 Ko**, sur 96 à 112 px. Avec `images.unoptimized: true`, l'attribut `sizes` est ignoré
  et le fichier complet part à chaque visite.
- **Uploads :** les images envoyées par l'admin sur Blob (`app/api/admin/catalogue/upload/route.ts`) sont
  stockées telles quelles, jusqu'à la limite d'upload, puis servies brutes dans les grilles (48 cartes en
  collection et wiki, 24 au marché). Les images AniList (~230 × 345 px, 15 à 60 Ko) passent par leur propre CDN.
- **Avatars Discord :** chargés sans `?size=`, en `.png` ou `.gif` animé, pour 28 à 80 px d'affichage.
- **Cache :** les fichiers de `public/` partent en `Cache-Control: public, max-age=0` (aucun en-tête n'est
  configuré). Chaque chargement complet renvoie un 304 par fichier, et c'est Node qui répond.

**Correction.**
- **Logo :** un WebP de 224 px de large, quelques Ko.
- **Uploads :** redimensionner et convertir à l'upload (WebP, 640 px au plus), avec `sharp`, déjà présent avec Next.
- **Discord :** ajouter `?size=64` aux URL des avatars (`?size=128` pour les plus grands).
- **Cache :** dans `next.config.ts`, `Cache-Control: public, max-age=31536000, immutable` sur `/brand/*`,
  `/card-backs/*` et `/icons/*`, en renommant les fichiers quand ils changent.
- **Alternative :** réactiver l'optimiseur `next/image` sur le VPS. L'ancien blocage (quota payant de Vercel)
  n'existe plus. En échange, le CPU du VPS travaille au premier affichage de chaque taille, puis le
  résultat reste en cache dans `.next/cache/images`. Le redimensionnement à l'upload reste préférable.

### M7. Zod envoyé au navigateur sur toutes les pages

**Constat (mesuré sur le build local).** Chaque page charge 265 à 340 Ko gzip de JavaScript :

| Part | Poids gzip |
| --- | --- |
| Socle Next et React | 167 Ko |
| Layout commun | 96 Ko |
| Dont un morceau qui ne contient que Zod | 31 Ko (110 Ko bruts) |

Zod arrive par cette chaîne d'imports : `AppHeader` → `components/chat/ChatDock.tsx` → `lib/chat/message.ts`
→ `lib/text/plain.ts` → `lib/zod.ts`. Le fichier `plain.ts` mélange `cleanPlainText`, une fonction simple,
et `noteSchema`, un schéma Zod.

**Correction.**
- Déplacer `noteSchema` dans son propre fichier (`lib/text/note-schema.ts`) et l'importer depuis le serveur.
  C'est fait, mais cela ne suffit pas.
- Après le correctif, le build local montre encore Zod sur toutes les pages :
  - le composant de carte `Fuda` valide l'apparence avec Zod dans le navigateur (`lib/catalog/appearance.ts`) ;
  - d'autres modules partagés (`lib/boosters/types.ts`, `lib/catalog/definitions.ts`,
    `lib/discord/join-modal.ts`, `lib/social/reviews.ts`…) mêlent schémas et constantes.
- Pour retirer les 31 Ko : résoudre l'apparence côté serveur et la transmettre déjà validée, puis séparer
  les schémas des constantes dans ces modules.

### M8. Plateau de combat re-rendu 4 fois par seconde

**Constat.** `useSecondsLeft` (`components/battle/TurnTimer.tsx:7-15`, intervalle de 250 ms) est appelé
en haut de `components/battle/BattleBoard.tsx:127`. Tout le plateau se re-rend donc 4 fois par seconde,
pendant les animations : six cartes, le journal, les contrôles.

**Correction.**
- Un composant de minuteur autonome qui reçoit `endsAt`, avec un anneau en animation CSS.
- Un seul `setTimeout` sur l'échéance pour réclamer la fin du tour.
- La nouvelle scène du jalon 3 remplace ce plateau : y appliquer ce schéma.

### M9. Inclinaison gyroscope sur toutes les cartes des grilles

**Constat.**
- `components/fuda/Fuda.tsx:226` enveloppe chaque carte avec effets dans `FudaTilt`.
- À chaque image (événement `deviceorientation`, ~60 par seconde sur Android), 4 variables CSS sont écrites
  par carte (`FudaTilt.tsx`).
- Sur 20 à 30 cartes en grille, le style est recalculé en continu et les effets sont repeints.

**Correction.** `still` ou `tilt={false}` sur les vignettes de collection, wiki et marché. Garder
l'inclinaison sur la carte ouverte en grand et sur la vitrine.

### M10. Sondages faits en Server Actions

**Constat.**
- Next exécute les Server Actions d'un onglet en file, une après l'autre. Un sondage en cours retarde
  d'un aller-retour le coup, la mise ou l'ouverture de booster qui suit.
- Chaque sondage est un POST sur l'URL de la page : il repasse par `proxy.ts` et refait l'authentification.
- Sondages concernés : cloche, combat, enchère (15 à 60 s), file d'attente (5 s), salon (15 s).

**Correction.** Passer ces lectures sur des Route Handlers `GET` appelés par `fetch`. Elles partent alors
en parallèle, peuvent répondre 304 avec un ETag et sortent de la file. Mêmes garde-fous que les actions :
session vérifiée, entrées Zod, rate limit en mémoire.

### M11. `/admin` monopolise le pool

**Constat.**
- Environ 18 requêtes en parallèle (`server/admin/dashboard.ts:13-38`,
  `server/economy/admin-queries.ts:8-30`, `server/battle/queries.ts:287-297`).
- Dont un `SUM` et un `GROUP BY` sur tout le journal des Zeni, et des filtres `createdAt >= since` sans
  index adapté sur CoinTransaction, BoosterOpening et Battle.
- Avec un pool de 5 connexions, ouvrir `/admin` fait attendre les joueurs.

**Correction.**
- Cache de 60 s sur le tableau de bord.
- Contrôle du journal à la demande (bouton) plutôt qu'à chaque vue.
- `@@index([createdAt], type: Brin)` sur les trois tables (dans la même migration que E4).

---

## Faible

- **F1. Cache des tirages récents** (`server/home/pulls.ts:79-80`).
  - La fenêtre `since`, arrondie à la minute, entre dans la clé de cache : une nouvelle entrée et un nouveau
    fichier dans `.next/cache` chaque minute et par langue.
  - Next ne purge jamais ce cache disque. Même chose pour la recherche du wiki : une entrée par terme.
  - **Correction :** une clé stable (taille et langue) et une durée de vie, ou un nettoyage périodique de `.next/cache`.
- **F2. Image de partage** (`app/[locale]/og-image/route.tsx`).
  - Rendue par Satori à chaque appel, avec 3 requêtes. Son `s-maxage` ne servait qu'au CDN de Vercel.
  - **Correction :** `export const revalidate = 86400`, ou un cache côté proxy.
- **F3. Métadonnées bloquantes.** `next.config.ts:24` : `htmlLimitedBots: /.*/` les rend bloquantes pour
  tout le monde, ce qui retarde le premier octet.
  - Ce choix servait les outils SEO.
  - Le motif par défaut de Next couvre déjà les robots des moteurs : à arbitrer.
- **F4. Service worker** (`public/sw.js:32-45`).
  - Il intercepte les navigations sans « navigation preload » : son démarrage (50 à 300 ms sur mobile)
    s'ajoute au temps de réponse.
  - **Correction :** `self.registration.navigationPreload.enable()` et `event.preloadResponse`.
- **F5. Animations hors écran.** Le ruban des tirages (`useMarquee.ts:57-71`) et le carrousel d'avis
  (`ReviewsCarousel.tsx:67-73`) tournent même quand ils ne sont pas visibles. `RecentPulls` sait déjà s'il est visible.
- **F6. Lectures trop larges.**
  - `server/profile/progress.ts:41` charge tous les exemplaires pour un `.length` : `distinct` est appliqué en mémoire.
  - `components/wiki/WikiCardDetail.tsx:27-29` charge toute la collection pour une carte.
  - `app/[locale]/collection/page.tsx:49-54` fait trois agrégats par vue.
- **F7. Comptes à rebours sur l'horloge locale.** Si l'horloge du téléphone est en avance, `NextFreeIn` et
  `MissionResetTimer` rafraîchissent trop tôt et restent bloqués à « 0 s ». Aucune boucle infinie de
  `router.refresh()` n'a été trouvée.
- **F8. Divers.**
  - Au retour sur l'onglet, la cloche sonde deux fois (`usePoll.ts:80-87` et `:99-107`).
  - Un minuteur par composant abonné à `useBoosterClock` (24 à 48 sur le marché).
  - `use-rarities.ts` refait un `JSON.parse` à chaque rendu de carte.
  - Le wiki sérialise toutes les séries vers le client.
- **F9. Restes de Vercel à nettoyer** : `vercel.json` (régions, crons), `attachDatabasePool`,
  `@vercel/functions`, l'épinglage de la CA Supabase.
  - Si pm2 passe en mode cluster : les compteurs de rate limit en mémoire et les `updateTag` restent propres
    à chaque processus.

**Hors périmètre de correction rapide : la CSP à nonce.** Elle rend toutes les pages dynamiques, sans page
statique ni ISR, même publiques. Le `cookies()` du layout l'imposerait de toute façon. Passer à des pages
statiques demanderait une CSP par hash (SRI expérimental) et un thème géré côté client. Le levier réaliste
est d'alléger chaque rendu (M3, M4, E5).

---

## Ce qui va bien (inutile d'y toucher)

- **Sondage partagé** (`components/realtime/usePoll.ts`) : pause quand l'onglet est caché ou le joueur
  inactif, ralentissement quand rien ne change, rattrapage au retour.
- **Temps réel :** une seule connexion Ably par onglet, chargée à la demande et fermée à l'inactivité.
- **Chargement :** le plateau de combat est chargé à la demande.
- **Liens :** ceux de l'en-tête, de la navigation et du ruban des tirages sont déjà en `prefetch={false}`.
- **Collection :** la grille est virtualisée.
- **Caches :**
  - `getCurrentUser` est sous `cache()`, donc pas de doublon d'identité dans un rendu ;
  - réglages, catalogue, raretés, classements, avis et pages légales sont en `unstable_cache` avec tags.
- **Base :**
  - chaque mouvement de Zeni tient en un UPDATE conditionnel et une ligne de journal ;
  - la pagination du marché est par curseur, avec des index adaptés ;
  - la table RateLimit est UNLOGGED ;
  - la session n'est réécrite qu'une fois par 24 h au plus.
- **Hors Vercel :** Speed Insights n'est monté qu'avec `VERCEL=1`, donc rien n'en part sur le VPS.

---

## Mesures à faire sur le VPS (lecture seule)

Ces commandes confirment C2, E1, E3 et M2. Elles n'écrivent rien et n'affichent aucun secret.

```bash
# Crons : y a-t-il quelque chose qui appelle /api/cron/* ?
crontab -l; ls /etc/cron.d; systemctl list-timers --no-pager | head

# Charge de la machine et de l'app
uptime; nproc; free -m
pm2 list                                    # mode fork ou cluster, redémarrages, mémoire

# Temps réel configuré ? (1 = clé présente, la valeur n'est pas affichée ; viser le fichier d'env lu par pm2)
grep -c '^ABLY_API_KEY=.' ~/kiraku/.env

# Attentes du pool (connexions refusées après 10 s)
pm2 logs --nostream --lines 5000 | grep -ci "timeout exceeded when trying to connect"

# Tables qui grossissent et parcours séquentiels
docker exec kiraku-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
  SELECT relname, n_live_tup, seq_scan, seq_tup_read, idx_scan,
         pg_size_pretty(pg_total_relation_size(relid)) AS taille
  FROM pg_stat_user_tables ORDER BY seq_tup_read DESC LIMIT 15;"'

# Connexions en cours
docker exec kiraku-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
  SELECT state, count(*) FROM pg_stat_activity GROUP BY state;"'

# Nombre d'invités (la purge tourne-t-elle ?)
docker exec kiraku-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
  SELECT \"isGuest\", count(*) FROM \"User\" GROUP BY 1;"'
```

Pour voir les requêtes lentes au fil de l'eau, régler `log_min_duration_statement = 200` dans Postgres.

---

## Plan de correction proposé

**Lot 1 — gros gains, faible risque (environ 1 jour) :**
1. C1 : `Link` sans prefetch par défaut.
2. C2 : crontab sur le VPS, après vérification.
3. E1 : réglage du pool.
4. E2 : saison verrouillée seulement à l'échéance.
5. M1 : `notif-sweep` en mémoire.
6. E5 : retrait des `router.refresh()` en double.
7. M7 : Zod hors du layout commun (non résolu, voir le suivi).
8. M6 : logo en WebP, cache longue durée sur `public/`.
9. E3 : `battle.pollSeconds` à 5 dans `/admin`.

**Lot 2 — une migration :** les index de E4 et M11, créés sur une base de test puis appliqués par
`migrate deploy` avant le redémarrage pm2.

**Lot 3 — refontes ciblées :**
- E3 : vérifier Ably, sortir le balayage du sondage, ralentir pendant le tour adverse.
- M10 : sondages en `GET`.
- M3 et M4 : identité en une requête, mémo des réglages, vagues de requêtes parallèles.
- M2 : réécriture des requêtes de notifications et d'amis, après `EXPLAIN ANALYZE`.
- M5 : pools et props de l'accueil.
- M8 et M9 : minuteur du combat (au jalon 3) et inclinaison des vignettes.
- M6 : redimensionnement à l'upload et taille des avatars Discord.

**Lot 4 — finitions :** F1 à F9.

Chaque lot se termine par `npm run lint`, `npm run typecheck` et les tests. Ensuite, une mesure avant et
après : onglet Réseau sur `/collection`, `/classement` et un combat, puis les commandes ci-dessus.
