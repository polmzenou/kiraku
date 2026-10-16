# Audit du lot 10d — 16 octobre 2026

Les erreurs Auth.js sont corrigées et les contrôles de code passent. **La mise en production
n'est pas validée** : les réserves npm, Lighthouse et les contrôles externes ci-dessous restent
à lever. La liste opérationnelle à cocher est dans [MISE-EN-PRODUCTION.md](MISE-EN-PRODUCTION.md).

## Auth.js et base

L'adaptateur chargeait la relation `Session.user` avec toutes les colonnes, alors que la base
avait deux migrations de retard. La lecture rencontrait les colonnes RGPD absentes et Auth.js
remontait `AdapterError`, puis `SessionTokenError`.

Les migrations additives `20261017000000_legal_pages_and_data_requests` et
`20261017010000_lot_grants` ont été appliquées via `prisma migrate deploy` sur la base configurée.
Aucune réinitialisation ni `db push`. Vérifications après application : les 17 migrations sont
à jour ; une session et sa relation utilisateur, y compris les nouvelles colonnes, se lisent.
L'adaptateur ne sélectionne désormais que les champs d'identité nécessaires à Auth.js.

**Contrainte confirmée par le propriétaire : local et production partagent actuellement la
même base.** Aucun test d'intégration n'a été lancé contre elle. Les tests `*.db.test.ts`
nécessitent une branche Neon séparée et `DATABASE_URL_TEST` ; ils restent à exécuter.

## Sécurité et conformité livrées

- Garde `requireActiveUser()` pour les lectures et sondages concernés : combat, marché,
  notifications, journal et confidentialité ; vérification du ban et du gel/anonymisation.
  La garde administrateur la réutilise. Les droits RGPD et la déconnexion restent accessibles
  selon leurs propres règles. Tests unitaires : absence de session, ban, suppression,
  anonymisation, invité actif et absence de fuite du hash.
- Rate limits ajoutés à la recherche de vedettes, à l'activité et à la déconnexion ; contrôle
  avant les lectures de lots dans les réglages économie/classé.
- `displayNameFor()` masque les pseudos privés, bloqués et anonymisés. « Joueur » / « Compte
  supprimé » sont localisés ; tirage, vendeurs et enchérisseurs l'utilisent, avec tests.
  Le tirage ne renvoie plus l'identité brute dans son objet public.
- `audit:actions` inspecte tous les fichiers source portant la directive `use server`, suit les
  helpers locaux et vérifie session, parse Zod et rate limit. 97 exports, 10 exceptions justifiées.
  Un cas négatif temporaire a confirmé l'échec pour les trois contrôles absents, même si leurs
  noms figurent en commentaire ou si le code appelle `JSON.parse`. Ce contrôle statique ne prouve
  pas à lui seul la propriété des données ou l'ordre de chaque branche métier.
- CSP conservée avec nonce et `strict-dynamic` : styles de balises avec nonce, attributs inline
  autorisés pour Motion. Zod passe en `jitless` dans le navigateur avant toute création de schéma,
  pour éviter sa détection de `new Function`. Référence : [documentation Zod](https://zod.dev/compile).
  Les diagnostics CSP des pages mesurées sont enregistrés avec les rapports Lighthouse.
- Pages d'erreur locale et globale génériques ; callback interne couverte par les tests ; cookies
  de session httpOnly, secure en production, sameSite=lax ; vérification Origin de l'export relue.
- CI : lint, typecheck, tests, audit des actions et audit npm bloquant au niveau **high**.

## Performance et ergonomie

- Messages client sélectionnés explicitement, admin fourni dans son layout. Un test recense les
  namespaces des composants client et hooks partagés pour éviter une traduction manquante.
- `domMax` de la vitrine est chargé dynamiquement ; les deux premières cartes sont prioritaires.
  Les variantes de boosters et liens de vitrine ne déclenchent plus de préchargements spéculatifs.
- Lectures indépendantes d'AppHeader regroupées. Les balayages de notifications passent au plus
  une fois toutes les 30 secondes par joueur, avec la même infrastructure distribuée de rate limit.
- Squelettes Yoru pour accueil, compte, marché, combat et profil.
- L'accueil affiche le catalogue public sans attendre une création d'invité. Le compte invité
  reste créé sur les écrans de jeu qui en ont besoin ; aucun solde n'est attribué par cette prévisualisation.
- La première mesure chargeait 366 fichiers de police et environ 10 Mo. Désactivation des
  préchargements, puis sous-ensembles latins locaux Shippori/Zen Kaku avec licences OFL ; Yuji
  Syuku reste dédiée aux sceaux, sans preload. Voir `app/fonts/README.md`.
  Seuls les cinq petits fichiers latins sont préchargés dans l'état final.
- Optimisation `next/image` réactivée : images dimensionnées et avatars servis par l'origine du
  site, avec cache de transformation. Prévoir les quotas de transformations d'images Vercel.
- Routage next-intl appliqué aussi aux préchargements : les réponses RSC non préfixées ne
  renvoient plus 404. Métadonnées avec origine explicite et dans `<head>` ; robots et sitemap
  ajoutés, sans identifiants de joueurs privés.
- Speed Insights présent sur Vercel et inscrit au registre sans stockage sur l'appareil.
  Sa collecte réelle et son activation restent à vérifier sur Vercel ; la qualification juridique
  du registre reste soumise à relecture. [Données collectées par Vercel](https://vercel.com/docs/speed-insights/privacy-policy).

### Poids des traductions

Tailles UTF-8 de l'objet JSON effectivement passé au fournisseur public et compression gzip,
sur les mêmes messages. Le retrait de l'admin était déjà partiellement engagé dans la branche.

| Langue | Tout le catalogue | Sans admin (état repris) | Sélection finale | Gzip avant → après |
| --- | ---: | ---: | ---: | ---: |
| fr | 112 575 o | 67 929 o | 65 827 o | 35 503 → 21 548 o |
| en | 102 260 o | 62 270 o | 60 353 o | 32 589 → 19 765 o |

Réduction de l'objet public : environ 41 % face au catalogue complet et 3 % supplémentaires
face au retrait du seul admin. Le transfert HTTP réel dépend aussi du flux RSC et de sa compression.

## Vérifications exécutées

| Contrôle | Résultat |
| --- | --- |
| Build de production | Passe |
| Lint | Passe, sans avertissement |
| Typecheck | Passe |
| Vitest | 737 tests passent ; 61 ignorés dans 10 suites d'intégration |
| `audit:actions` | Passe : 97 actions |
| `prisma migrate status` | 17 migrations à jour |
| Lecture réelle session/utilisateur | Passe, sans affichage d'identifiants ni jetons |
| Précontrôle de l'environnement local | Passe, avertissement base de test absente |
| `npm audit --omit=dev --audit-level=high` | 0 vulnérabilité |
| `npm audit --audit-level=high` | Échec : 5 alertes high dans une même chaîne ESLint |
| Export sans Origin / Origin étrangère | Refus HTTP 403, avant toute collecte |
| robots / sitemap | Réponse HTTP 200 |

Les chemins inconnus répondent HTTP 200 une fois le flux démarré, avec `noindex` confirmé dans
les deux langues. Leur écran localisé reste à contrôler lors du dernier tour. Ne pas confondre
la présence visuelle d'une page 404 et un statut HTTP 404 avant de paramétrer la supervision.

Le précontrôle local en mode production signale `APP_URL` non HTTPS et `CRON_SECRET` absent,
ainsi que les services facultatifs non configurés. Cela décrit `.env.local`, **pas** les variables
Vercel, qui n'ont pas été consultées. Renseigner et contrôler les valeurs de production séparément.

L'alerte restante vient de `braces` via `micromatch` → `fast-glob` → `@next/eslint-plugin-next`
→ `eslint-config-next`. L'[avis de sécurité](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
annonce qu'aucun correctif n'est publié. La proposition automatique de downgrade vers Next/ESLint
14 n'a pas été appliquée. La CI reste volontairement bloquante ; ne pas abaisser son seuil.

## Lighthouse

Build `next build`, serveur `next start`, Lighthouse 13.5, Chrome installé, 375 × 812 à DPR 3,
throttling mobile simulé par défaut. Le processus d'audit utilise le runtime Node récent fourni
par Codex ; l'installation Node locale est 22.14 et doit être portée à 22.19+ pour l'outil.
L'application cible Node 22 ; CI et Vercel doivent utiliser une version 22 à jour.

L'origine canonique doit correspondre au port audité (`APP_URL=http://localhost:3001` pour ce
serveur), sinon Lighthouse signale à raison une canonical pointant vers une autre origine.
Les rapports HTML/JSON et les diagnostics CSP sont dans `reports/lighthouse/`, ignorés par Git.
Le profil public est un vrai profil ; la collection et le compte sont ceux d'un invité neuf.
Les mesures n'établissent pas les performances d'une grosse collection connectée.

| Page | Perf | A11y | BP | SEO | LCP ms | CLS | TBT ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| / | 78 | 96 | 100 | 100 | 4970 | 0 | 158 |
| /collection | 83 | 96 | 100 | 63 | 2489 | 0.291 | 0 |
| /marche | 100 | 96 | 100 | 66 | 1053 | 0 | 89 |
| /compte | 100 | 96 | 100 | 63 | 711 | 0 | 58 |
| /u/Kata | 95 | 96 | 100 | 100 | 2700 | 0 | 138 |
| /wiki | 95 | 96 | 100 | 100 | 1610 | 0 | 257 |
| /mentions-legales | 99 | 96 | 100 | 100 | 749 | 0 | 141 |

Dernière série : 2026-10-16T17:42:08.100Z. Aucun des sept diagnostics CSP ne contient de violation.

Restent sous les objectifs : accueil (Performance/LCP), première création d’invité dans la collection (Performance/CLS), profil (LCP), wiki (TBT). Les pages privées échouent aussi au seuil SEO par conception. Les budgets ne sont donc pas validés.

Les mesures varient entre séries ; elles ne doivent pas être remplacées par la meilleure valeur observée. La collection était vide après création d’un invité, ce qui identifie le changement de mise en page du bootstrap comme point à reprendre.


Les pages privées gardent leur `noindex` : il ne faut pas rendre compte, marché ou collection
personnelle indexables pour gagner des points SEO. Le script reste strict et signale ces échecs.
Toute mesure encore sous un seuil interdit de cocher la validation globale Lighthouse.

## Restant avant lancement

- Branche Neon isolée, migrations de test et toutes les suites DB, dont les 50 enchères simultanées.
- Contrôle authentifié de `/admin/economie` : aucun écart entre soldes et journal.
- Écarts Lighthouse ci-dessus, mesures sur une collection remplie et confirmation des budgets
  sur un environnement proche de la production.
- Services Vercel/Discord/Resend/Upstash/Ably/VAPID, crons, domaine, sauvegardes, contenu légal
  et réglages métier : vérifier les cases de la checklist, sans supposer qu'elles sont configurées.
- Tests physiques Safari/iPhone et Chrome/Android, PWA/push, ouverture et combat ; parcours
  Discord et acceptation des CGU, ainsi que la page 500 en environnement contrôlé.
