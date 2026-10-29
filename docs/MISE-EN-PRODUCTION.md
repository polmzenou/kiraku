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
- [ ] Registre des cookies relu : Speed Insights est déclaré comme mesure sans stockage sur
  l'appareil, exemptée dans le registre. Faire confirmer cette qualification lors de la relecture
  juridique ; l'absence de cookie seule ne suffit pas à établir une exemption.

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
