# Kiraku

Application web mobile first d'ouverture de boosters de cartes de personnages d'anime (sachets → fuda), avec collection, amis, vitrine, hôtel des ventes en Zeni, combats 1v1 et mode classé.

Le plan complet est dans `docs/PLAN.md`. Lis la section concernée avant chaque tâche ; en cas de doute entre ce fichier et le plan, le plan fait foi.

## Stack

- Next.js (App Router, Server Components, Server Actions), TypeScript strict
- Prisma + Supabase Postgres (`@prisma/adapter-pg` via `server/pg-adapter.ts` ; `DATABASE_URL` = pooler en mode transaction, port 6543 ; `DIRECT_URL` = pooler en mode session, port 5432, pour les migrations)
- Auth.js : compte invité automatique, puis connexion Discord
- next-intl : français par défaut (sans préfixe), anglais sous `/en`
- Tailwind avec les tokens de la DA Kiraku, Motion (`LazyMotion`) pour les animations
- Zod pour toute entrée, Upstash Ratelimit, déploiement Vercel

## Règles non négociables

1. **Le serveur décide de tout** : tirages, soldes, prix, résultats de combat. Le client n'envoie que des intentions et des ids.
2. **Argent virtuel et cartes** : toute écriture sur Zeni ou `UserCard` se fait dans une transaction, avec `SELECT … FOR UPDATE` ou un `updateMany` conditionnel, et une ligne `CoinTransaction`.
3. **Sécurité** (section « Sécurité applicative » du plan) :
   - jamais de `$queryRawUnsafe` / `$executeRawUnsafe`, seulement `$queryRaw` en template balisé ;
   - jamais de `dangerouslySetInnerHTML` (sauf markdown légal via `react-markdown` sans HTML brut, et `components/seo/JsonLd.tsx` : données schema.org typées construites côté serveur, `<` échappé) ;
   - chaque Server Action : session vérifiée → entrées validées par Zod → propriété vérifiée → rate limit ;
   - on écrit en base des champs choisis un par un, jamais un objet venant du client ;
   - secrets uniquement côté serveur (`server-only`), jamais en `NEXT_PUBLIC_`.
4. **Aucun réglage de jeu en dur** : délais, taux, prix, barèmes du classé se lisent dans `GameSetting` (valeurs par défaut dans le code), modifiables depuis `/admin`.
5. **i18n dès la première ligne** : aucun texte en dur dans les composants, tout passe par `t()` avec des clés dans `messages/fr.json` et `messages/en.json`.
6. **Mobile first** : on conçoit en 375 px, puis on élargit. Zones tactiles ≥ 44 px.
7. **Fluidité** : animations en `transform`/`opacity` uniquement, `prefers-reduced-motion` respecté, `next/image`, imports dynamiques pour les parties lourdes (replay de combat, admin).

## Direction artistique

Thème sombre **Yoru** par défaut, thème clair **Washi** en option. Tokens (à exposer en variables CSS et dans Tailwind) :

| Token | Yoru | Washi |
| --- | --- | --- |
| bg | #15120F | #F3ECDF |
| surface | #221D18 | #E9E0CC |
| surface-2 | #2B251F | #E2D7C0 |
| border | #3A322A | #D9CFBC |
| text | #F1E9DA | #1F1B17 |
| text-muted | #A89F92 | #6B645A |
| shu (accent) | #E0533F, boutons #C8372D | #C8372D |
| ai | #7FA3D1 | #1E3557 |
| kin | #D9B556 | #B08A2E |

Polices : Shippori Mincho B1 (titres), Zen Kaku Gothic New (texte, chiffres tabulaires), Yuji Syuku (kanji des sceaux, en sous-ensemble). Pas de police monospace.

Raretés = matières : Commune 並 washi · Peu commune 良 bambou · Rare 稀 indigo · Épique 秀 laque · Légendaire 金 feuille d'or · Mythique 神 nacre. Booster = sachet métallisé classique serti en dents de scie, couleur et motif wagara propres à chaque booster (thème de `BoosterType`, réglable dans l'admin), étiquette tanzaku en washi avec le kanji ; formats spéciaux pochibukuro (enveloppe) et jūbako (boîte laquée). Carte = fuda en papier. Ne jamais reprendre le visuel de Kyara (voir la liste dans le plan).

## Façon de travailler

- Une étape de la roadmap (fin du plan) par session ou par branche. Commence par proposer un plan en mode Plan, attends validation, puis code.
- Migrations Prisma nommées (`npx prisma migrate dev --name …`), jamais de `db push` sur la base de prod.
- Chaque étape se termine par : `npm run lint`, `npm run typecheck`, les tests (Vitest pour la logique : tirages, pitié, enchères, classé), et un résumé de ce qui a changé.
- Logique métier pure dans `lib/` (testable sans base) ; accès base dans `server/` ; composants dans `components/`.
- Avant l'hôtel des ventes en production : test de 50 enchères simultanées qui vérifie que la somme des soldes ne bouge pas.
