# Kiraku

Application web mobile first d'ouverture de boosters de cartes de personnages d'anime (sachets → fuda), avec
collection, amis, vitrines, hôtel des ventes en Zeni, combats 1v1 et mode classé.

## Documentation

- `docs/PLAN.md` : le plan complet (jeu, architecture, sécurité, roadmap). Il fait foi.
- `CLAUDE.md` : la stack, les règles non négociables et la direction artistique, en bref.
- `deploy/README.md` : déploiement sur le VPS, crons, sauvegarde et restauration de la base.
- `docs/MISE-EN-PRODUCTION.md` : la liste à cocher avant chaque lancement.
- Guides par sujet : `docs/DISCORD.md`, `docs/admin-catalogue.md`, `docs/catalog-import.md`,
  `docs/KYARA-IMPORT.md`.

## Développement

Node 22 (voir `engines` dans `package.json`) et une base PostgreSQL 17 à soi, jamais celle de la production.

```bash
npm ci                         # dépendances, puis prisma generate
cp .env.example .env.local     # à remplir (aucune variable NEXT_PUBLIC_)
npx prisma migrate deploy      # schéma sur la base de .env.local
npm run dev                    # http://localhost:3000
```

Avant de pousser, les contrôles de la CI :

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:sim
npm run audit:actions
```

Les tests sur base réelle (`*.db.test.ts`) ne tournent qu'avec `DATABASE_URL_TEST`, qui vise une base jetable.

## Production

Un VPS OVH : le serveur Next.js autonome sous pm2 derrière Nginx, PostgreSQL 17 sur la même machine. Une mise à
jour se fait par `bash deploy/deploy.sh` sur le VPS, une fois la PR fusionnée sur `main` (`deploy/README.md`).

## Images

Les illustrations AniList et les avatars Discord sont chargés directement depuis leurs CDN.
L'optimisation de `next/image` est désactivée globalement avec `images.unoptimized: true`
dans `next.config.ts` : à l'époque de Vercel, les quotas de transformation bloquaient leur affichage
(`402 OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED`). Ce réglage couvre aussi les futures images.
Le chargement différé et les dimensions des composants `Image` sont conservés.
La disponibilité des fichiers dépend toujours des CDN d'origine.
