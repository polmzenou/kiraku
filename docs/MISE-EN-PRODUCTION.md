# Mise en production — lot 10d

Cette liste est à cocher pour **chaque lancement**. Une case vide reste une vérification à faire,
même si le code est livré. Ne jamais lancer les tests `*.db.test.ts` contre la base utilisée par
les joueurs. Le développement utilise actuellement la même base que la production : créer une
base isolée (projet ou branche Supabase distinct) pour ces tests et pour les futurs développements
qui modifient des données.

## Environnement et base

- [ ] Relire toutes les variables de `.env.example` dans Vercel, en distinguant Production et Preview.
  `DATABASE_URL` est le pooler Supabase en mode transaction (port 6543) ; `DIRECT_URL` vise le même
  projet par le pooler en mode session (port 5432) : l'hôte direct `db.<ref>.supabase.co` est en IPv6
  seulement, injoignable depuis Vercel. `AUTH_SECRET` a au moins 32 caractères.
- [ ] Configurer `DATABASE_URL_TEST` sur une base **distincte** et appliquer les migrations
  sur cette base avant les tests. Garder cette variable hors du déploiement public.
- [ ] `node scripts/check-deploy-env.mjs --production` termine sans erreur avec les valeurs de production.
  Le script masque les secrets et vérifie les groupes de clés, les URL et la séparation de la base de test.
- [ ] Projet Supabase de production choisi ; sauvegardes (et PITR selon le plan) activées et restauration vérifiée.
- [ ] Data API Supabase désactivée et RLS active sur toutes les tables de `public` (advisors Supabase sans alerte de sécurité).
- [ ] `npm run db:status`, puis `npm run db:deploy` si nécessaire (`prisma migrate deploy`, jamais `db push`).
  `vercel-build` fait déjà ce déploiement avant les seeds et le build.

Si Auth.js signale `AdapterError` puis `SessionTokenError` avec une colonne inexistante : vérifier
d'abord `npm run db:status`. Le 16 octobre 2026, les migrations
`20261017000000_legal_pages_and_data_requests` et `20261017010000_lot_grants` manquaient ; elles
ont été appliquées sans suppression. `prisma generate` régénère le client, il ne migre pas la base.
Après un changement de schéma, régénérer le client et redémarrer le serveur.

## Connexion et services

- [ ] Discord : `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET`, redirection OAuth de production
  `https://DOMAINE/api/auth/callback/discord`, et `ADMIN_DISCORD_ID` relus.
- [ ] Si les annonces de liaison Discord sont utilisées : `DISCORD_BOT_TOKEN` et
  `DISCORD_LINK_CHANNEL_ID` configurés, permissions du salon vérifiées.
- [ ] Resend : `RESEND_API_KEY`, `MAIL_FROM`, domaine vérifié, SPF et DKIM valides.
- [ ] `APP_URL` correspond à l'origine HTTPS définitive, sans chemin.
- [ ] Limitation anti-abus : en base (table `RateLimit`), rien à configurer. Supprimer les anciennes variables `UPSTASH_REDIS_REST_*` / `KV_REST_API_*` si elles traînent encore.
  Aucun repli mémoire en production ; vérifier les quotas et les erreurs Redis.
- [ ] Ably : `ABLY_API_KEY`, publication et abonnement autorisés, connexion de combat vérifiée.
- [ ] Push : clés `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` configurées pour cet environnement.
- [ ] `CRON_SECRET` aléatoire (au moins 16 caractères) ; crons installés dans la crontab du VPS
  (`deploy/crontab.example`, `vercel.json` n'est lu que par Vercel) : `/api/cron/market` à 04:00,
  `/api/cron/battle` à 04:15, `/api/cron/accounts` à 04:30. Sans eux : ni effacements RGPD à
  échéance, ni purge des invités, de RateLimit, du chat et des tirages.
- [ ] Domaine définitif et HTTPS valides. Soumettre au préchargement HSTS **uniquement une fois
  le domaine définitif**, après vérification de ses sous-domaines.

## Catalogue, contenu et réglages

- [ ] Import du catalogue terminé, pools recalculés, saison classée ouverte.
- [ ] Tous les repères `[[…]]` des contenus légaux remplis (éditeur, contact, hébergeur Vercel Inc.
  et adresse vérifiée). Relire les versions française et anglaise.
- [ ] Relecture juridique effectuée ; CGU v1 publiées et parcours d'acceptation validé.
- [ ] `discord.joinModal.enabled = false`, `shop.premiumEnabled = false`.
- [ ] État de `features.casino` décidé ; taux, prix et pools de boosters relus dans l'admin.

## Lancement du casino

**Avant :**

- [ ] Migration `20261117120000_casino_pile_ou_face` appliquée par `npm run db:deploy` sur le VPS, **avant**
  le redémarrage PM2 de la version qui la lit.
- [ ] Ligne `/api/cron/casino` de `deploy/crontab.example` installée (filet de sécurité quotidien des tables échues).
- [ ] `/admin/casino` : date d'ouverture réglée, raretés jouables et garde-fous relus. L'équipe vérifie le hall en
  aperçu et joue une table entre deux comptes de l'équipe.
- [ ] Discord : `DISCORD_CASINO_CHANNEL_ID` dans l'environnement, annonces du casino allumées dans `/admin/discord`,
  teaser posté quelques jours avant (voir `docs/DISCORD.md`).
- [ ] Jauge (`/admin/evenement`) : comptage en lancers, fenêtre calée sur l'ouverture, objectif, lot de récompense
  prêt dans `/admin/lots`.
- [ ] Nouvelle clause casino des CGU publiée depuis `/admin/legal` (elle ne force pas une nouvelle acceptation).

**À l'ouverture :**

- [ ] Bannière Nouveautés publiée depuis `/admin/nouveautes` (sceau 賭, lien vers `/casino`).
- [ ] Annonce d'ouverture postée seule par le cron Discord ; vérifier le message dans le salon.
- [ ] `/admin/casino` : santé du séquestre « Sain » (autant de cartes en jeu que de tables ouvertes).

**Fin de la fenêtre de la jauge :**

- [ ] Objectif atteint : envoyer la récompense à tous depuis `/admin/lots` (jamais versée deux fois au même joueur).
- [ ] Registre des cookies relu : Speed Insights est déclaré comme mesure sans stockage sur
  l'appareil, exemptée dans le registre. Faire confirmer cette qualification lors de la relecture
  juridique ; l'absence de cookie seule ne suffit pas à établir une exemption.

## Lancement du prestige

**Avant :**

- [ ] Migrations `20261118120000_prestige_copies`, `20261118130000_prestige_cycles`,
  `20261118140000_prestige_printings` et `20261118150000_prestige_sanctuary` appliquées par `npm run db:deploy` sur le
  VPS, **avant** le redémarrage PM2 de la version qui les lit. Elles ne réécrivent pas `UserCard` (valeurs par défaut
  constantes, clé étrangère des gravées posée `NOT VALID`).
- [ ] Tests sur base réelle passés sur la base de test (`DATABASE_URL_TEST`) : `server/prestige/prestige.db.test.ts`
  (renaissances et consécrations simultanées) et `server/prestige/printing.db.test.ts` (50 gravures sur un tirage
  presque épuisé, aucun numéro en double, aucun interblocage).
- [ ] `/admin/prestige` : seuils par rareté relus avec l'aperçu d'équilibrage (combien de joueurs seraient
  éligibles), héritières, barème des Zeni, chances et tailles des gravées (Mythique et au-dessus seulement), sceau du
  premier tirage. L'équipe renaît en aperçu (interrupteur coupé) sur un compte de test et vérifie le rite, le chiffre
  romain partout, une gravée tirée, sa vente au Marché et sa mise au casino.
- [ ] Cosmétiques du prestige installés depuis `/admin/prestige` (titres, cadres tensei, hanga et hono, pseudo or).
- [ ] Discord : `DISCORD_PRESTIGE_CHANNEL_ID` dans l'environnement si les annonces sont voulues (voir
  `docs/DISCORD.md`), interrupteur `discord.prestigeEnabled` dans `/admin/discord`.
- [ ] Essai sur un vrai téléphone en 375 px, Yoru et Washi : page `/prestige`, rite 転生, révélation à la baren,
  consécration 奉納, sanctuaire et rouleaux du profil ; puis en mouvement réduit.

**À l'ouverture :**

- [ ] Interrupteur `prestige.enabled` allumé (`/admin/prestige` ou `/admin/fonctionnalites`).
- [ ] Bannière Nouveautés depuis `/admin/nouveautes` (sceau 転, lien vers `/prestige`).

## Bans réseau

**Avant :**

- [ ] Migration `20261120100000_network_bans` appliquée par `npm run db:deploy` sur le VPS, **avant** le redémarrage PM2
  de la version qui la lit. Sans elle, la lecture des bans échoue à chaque page ; elle laisse alors passer (journalisée
  `[bans réseau] lecture`), mais aucun ban ne tient.
- [ ] Nginx : `X-Forwarded-For` doit se terminer par l'IP du visiteur (`proxy_set_header X-Forwarded-For
  $proxy_add_x_forwarded_for;`), sans CDN ni autre proxy devant Nginx. Sinon l'IP vue serait celle du proxy, la même
  pour tout le monde : la limite `multiAccount.sharedIpCap` refuserait tout ban d'IP. À vérifier sur sa propre fiche
  admin : les IP relevées doivent être celles de sa box et de son téléphone.
- [ ] Tests sur base réelle passés sur la base de test : `server/anticheat/network-ban.db.test.ts`.
- [ ] Politique de confidentialité : publier depuis `/admin/legal` une nouvelle version reprenant
  `prisma/seed/legal/confidentialite.{fr,en}.md` (IP et identifiant d'appareil gardés 90 jours, et tant que dure un
  bannissement). La page Cookies liste désormais `__Secure-kiraku.device`.
- [ ] `/admin/general`, section multi-comptes : relire le ban qui suit l'appareil (interrupteur, comptes tolérés,
  durée, IP par appareil).

**Essai :**

- [ ] Sur un compte de test : bannir son appareil depuis sa fiche admin. L'écran « Accès bloqué » remplace toutes les
  pages sauf les textes légaux et `/connexion` ; un compte de l'équipe sur le même navigateur passe ; « Lever » rend
  l'accès.

## Lancement de l'import Kyara

**Avant :**

- [ ] Migrations `20261122160000_kyara_import` et `20261122200000_kyara_import_simple` appliquées par
  `npm run db:deploy` **avant** le redémarrage PM2. La première reprend `User.registeredAt` des comptes déjà inscrits
  (`COALESCE(discordLinkedAt, createdAt)`).
- [ ] Le test des routes de Kyara (`docs/KYARA-IMPORT.md`) est fait avec deux vrais comptes, et le favori recalé si
  besoin (`BOOKMARKLET_BUILD` augmenté).
- [ ] Un compte Kyara « Kiraku » existe, lié à un compte Discord de l'équipe, et chaque membre qui traite la file
  peut s'y connecter.
- [ ] `/admin/kyara` : profil Kyara du compte Kiraku renseigné, barème et plafond relus. Chaque membre qui traite la
  file génère son favori (« Générer mon favori », sur le site de prod) et l'installe.
- [ ] Nouvelles versions de la politique de confidentialité et des CGU publiées depuis `/admin/legal`.

**Lancement :**

- [ ] Essai complet en prod avec l'import coupé : un membre de l'équipe demande l'import de son propre compte Kyara
  (l'équipe peut demander même coupé), un autre membre ouvre son profil sur Kyara et clique son favori : versé
  aussitôt.
- [ ] Date de sortie posée (pas avant le déploiement), puis interrupteur allumé. Les comptes déjà inscrits ont
  `kyaraImport.windowDays` jours à partir de cette date.
- [ ] Annonce sur le Discord : la page `/compte/import-kyara` et les deux étapes sur Kyara (ami, « Montrer ma
  collection »).

## Lancement du parrainage v2 et de l'Ennichi

Étape 18 (`docs/PLAN.md`, « Parrainage v2 et événement Ennichi »). Deux interrupteurs coupés par défaut :
`referral.v2.enabled` et `ennichi.enabled`. Tant qu'ils le sont, la v1 tourne sans changement.

**Avant (dans cet ordre, sur le VPS) :**

- [ ] Migrations `20261124120000_referral_v2` et `20261124180000_ennichi` appliquées par `npm run db:deploy`, **avant**
  le redémarrage PM2 de la version qui les lit.
- [ ] `npm run seed:referral` : lots à identifiant fixe (`seed-lot-pv2-*` des étapes, des paliers et du
  grand-parrainage, `seed-lot-enn-*` des lanternes, du banzuke et de l'omikuji) et réglages absents. Rien n'est écrasé.
  Les Divins sont des sachets scellés : le type de booster divin doit exister.
- [ ] `npm run seed:cosmetics` : cadre « fil rouge » (`cadre-fil-rouge`, palier 1 ami installé). Il reste caché aux
  joueurs, ni affiché ni portable, tant que `referral.v2.enabled` est coupé.
- [ ] Crons de `deploy/crontab.example` installés : `/api/cron/referral` (chaque heure) et `/api/cron/ennichi`
  (toutes les 5 minutes : envoi des paliers de lanternes, tirage de secours à la date de clôture, prix restants).
- [ ] Discord : salon **privé** de l'équipe créé, bot autorisé, `DISCORD_REFERRAL_CHANNEL_ID` posé (voir
  `docs/DISCORD.md`, « Activer le fil du parrainage ») ; salon public des annonces : `DISCORD_ANNOUNCE_CHANNEL_ID`,
  bot autorisé à y écrire et à mentionner @everyone. Puis `npm run build` et redémarrage PM2.
- [ ] Tests sur base réelle passés sur la base de test (`DATABASE_URL_TEST`) : `server/referral/*.db.test.ts`,
  `server/ennichi/ennichi.db.test.ts`, `server/collection/transfer-guard.test.ts`.
- [ ] `/admin/parrainage/reglages` relu par l'équipe : lots des étapes des deux côtés, part « confiance », paliers,
  contrôles (âge Discord 30 j, score, verrous 14 j / 30 j). `/admin/parrainage/ennichi` : paliers 25 / 50 / 200 / 500
  et leurs lots, rangs du banzuke, cagnotte de l'omikuji, limite par IP.
- [ ] Nouvelles versions des CGU (règles du parrainage, de l'Ennichi et de la triche) et de la politique de
  confidentialité (contrôles, empreintes, résultats publiés) publiées depuis `/admin/legal`, reprises de
  `prisma/seed/legal/{cgu,confidentialite}.{fr,en}.md`. La page Cookies décrit déjà `__Secure-kiraku.ref`.
- [ ] Essai sur un vrai téléphone en 375 px, Yoru et Washi : lien partagé `?ref=`, lettre `/i/CODE`, premier booster
  en invité, inscription, `/parrainage` (sans filleul, avec, vue du filleul), « Comment ça marche », bons ; puis
  `/ennichi` et ses trois pages, en mouvement réduit aussi.

**Lancement du parrainage v2 :**

- [ ] `npm run referral:switch`, **juste avant** d'allumer : parrainages v1 en attente convertis en v2, empreintes des
  filleuls existants posées. Il ne convertit que les parrainages en attente au moment où il tourne (la v1 en crée tant
  que l'interrupteur est coupé) : pas au déploiement s'il précède le lancement de plusieurs jours. Idempotent.
- [ ] `referral.v2.enabled` allumé (`/admin/parrainage/reglages` ou `/admin/fonctionnalites`).
- [ ] Date de l'annonce `referral.v2.announceAt` posée **après** le déploiement (« Maintenant » dans
  `/admin/parrainage/reglages`) : la fenêtre « Le parrainage change » s'affiche une fois aux comptes déjà inscrits,
  pendant `referral.v2.announceDays` jours.
- [ ] Un premier parrainage réel suivi de bout en bout : étape 1 versée des deux côtés avec la notification, message dans
  le salon privé.

**Lancement de l'Ennichi :**

- [ ] `/admin/parrainage/ennichi` : édition, date de début, jours de fête (14) et de clôture (3), multiplicateur (×2),
  puis « Fête allumée ». L'empreinte de la graine est engagée dès que la fête est allumée et datée (visible sur
  `/ennichi/omikuji`) : ne plus changer l'édition ensuite.
- [ ] Annonce à la communauté publiée depuis `/admin/parrainage/annonce` (aperçu relu, puis « Publier » : @everyone).
- [ ] Bannière Nouveautés depuis `/admin/nouveautes` si voulue (sceau 祭, lien vers `/ennichi`).

**Clôture (après les 14 jours) :**

- [ ] `/admin/parrainage/ennichi` : « Contrôler » (scores recalculés, file « À vérifier » remplie), puis trancher la
  file dans `/admin/parrainage`.
- [ ] « Arrêter et tirer » avant la date de clôture (sinon le cron tire seul à cette date) : banzuke et tickets figés,
  omikuji tiré, prix versés ; ce qui reste est versé par le cron. Vérifier le tirage depuis `/ennichi/omikuji`
  (« Vérifier ») et le message des résultats dans le salon privé.
- [ ] Gagnants de bons (Mythique au choix, carte 1/1) : ils choisissent leur carte sur `/parrainage/bons`.

## Contrôles techniques

- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run audit:actions` passent.
- [ ] `npm audit --omit=dev --audit-level=high` et `npm audit --audit-level=high` propres.
  La CI bloque au niveau **high**, sans abaisser le seuil pour masquer une alerte.
- [ ] Tous les `*.db.test.ts` passent avec `DATABASE_URL_TEST` sur la branche isolée, notamment
  les 50 enchères simultanées et l'invariant soldes + séquestres + taxes.
  Exemple PowerShell : configurer la variable localement, puis `npm test` (Vitest ne charge pas
  automatiquement `.env.local` : exporter la variable dans le processus de test).
- [ ] `/admin/economie` n'affiche aucun écart entre soldes et journal.
- [ ] Aucun détail technique dans les écrans 500 localisés et l'erreur globale.
- [ ] Callback Auth.js interne ; cookies d'authentification httpOnly, secure sur HTTPS,
  sameSite=lax ; export `POST /api/me/export` refusé sans Origin autorisée.
- [ ] CSP sans violation : tester navigation directe **et** navigation client, police des sceaux,
  animations Motion, profil/vitrine, ouverture de booster et combat.
  Essai : `style-src-elem 'self' 'nonce-…'`, `style-src-attr 'unsafe-inline'`.
  Si Next.js injecte une balise sans nonce, conserver la politique compatible et consigner la preuve
  dans `docs/AUDIT-10D.md` avant de cocher.
- [ ] Speed Insights activé dans Vercel ; script `/_vercel/speed-insights/script.js` sur la même
  origine, compatible avec `strict-dynamic`, collecte visible après déploiement.
  Le composant est chargé sur Vercel ; le serveur local n'expose pas cette route.

## Lighthouse mobile

Utiliser Node **22.19 ou plus récent dans la branche 22**, requis par Lighthouse 13.5.
Rapports JSON et HTML : `reports/lighthouse/` (ignorés par Git).

```powershell
npm run build
# Dans un autre terminal, PowerShell peut avaler les options passées par npm :
$env:APP_URL = "http://localhost:3001" # même origine que le serveur audité
node node_modules/next/dist/bin/next start --port 3001
node scripts/lighthouse.mjs --base http://localhost:3001 --profile /u/PSEUDO_PUBLIC
```

- [ ] Build de production utilisé (`next build`, puis `next start`), aucun serveur `next dev`.
- [ ] Pages : `/`, `/collection`, `/marche`, `/compte`, un vrai profil public, `/wiki`, `/mentions-legales`.
- [ ] Fenêtre 375 × 812, DPR 3, throttling mobile simulé par défaut de Lighthouse.
- [ ] Sur chaque page : Performance ≥ 90, Accessibilité ≥ 95, Bonnes pratiques ≥ 95, SEO ≥ 95,
  LCP < 2 500 ms, CLS < 0,1, TBT < 200 ms. Chaque échec reçoit une correction ciblée.
- [ ] Vérifier le contenu mesuré : pas de redirection vers la connexion, de squelette ou
  d'écran d'erreur pris pour la page attendue. Compléter les mesures invitées avec un compte
  possédant des cartes ; ne pas rendre des pages privées indexables pour améliorer le score SEO.

## Validation manuelle et exploitation

- [ ] iPhone Safari, vrai appareil en 375 px : installation PWA, push, ouverture de booster, combat.
- [ ] Android Chrome, vrai appareil en 375 px : mêmes parcours, plus installation par le bouton.
- [ ] Vercel : pare-feu, protection anti-robots et Speed Insights activés ; logs et alertes surveillés.
- [ ] Repli : déploiement précédent identifié et Instant Rollback accessible. Les migrations livrées
  sont additives ; confirmer la compatibilité du déploiement précédent avant le lancement.
  Un rollback Vercel ne restaure pas la base ; ne pas annuler une migration destructive par improvisation.
- [ ] Dernier tour : robots et sitemap, pages 404 et 500, parcours invité → Discord → CGU acceptées.

Le bilan réellement exécuté et les réserves sont dans `docs/AUDIT-10D.md`.
