# Bascule Neon → Supabase (25/10/2026)

**Pourquoi.** Depuis le 25/10 vers 01 h UTC, Neon refuse toutes les connexions avec l'erreur `53000`
(« exceeded the quota »), y compris en lecture. Les digests vus en prod (`1045450991`, `3382162756`, …)
viennent tous de là.

**Cible.** Projet Supabase `kiraku`, ref `fupmqaqbusfosyuiovqe`, eu-west-1, Postgres 17.
Le code de la branche `migration-supabase` utilise `@prisma/adapter-pg` (`server/pg-adapter.ts`).

**Règle d'or.** Aucune écriture ne doit atteindre Neon entre la copie et la bascule : le site reste en
pause du début à la fin. Neon n'est ni modifié ni supprimé, il sert de retour arrière.

Toutes les commandes se lancent dans **Git Bash**, à la racine du dépôt, avec Docker Desktop démarré.
`MSYS_NO_PATHCONV=1` empêche Git Bash de réécrire les chemins `/out/…` passés à Docker. Les URL restent
dans des variables d'environnement : ne les colle pas dans un fichier, ni dans un ticket.

---

## 0. Préparer Supabase (avant la coupure)

1. **CA TLS.** Dashboard → Database → Settings → SSL Configuration → *Download certificate*, puis :
   ```bash
   openssl x509 -in ~/Downloads/prod-ca-2021.crt -noout -fingerprint -sha256
   ```
   Le résultat doit être `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`,
   la CA épinglée dans `server/pg-adapter.ts`. S'il diffère, on s'arrête.
2. **Data API off.** Settings → API (Data API) → désactiver, ou au minimum retirer `public` des
   *Exposed schemas*. Prisma n'en a pas besoin.
3. **URL de connexion.** Connect → ORMs → Prisma. Note :
   - `DATABASE_URL` : pooler **transaction**, port **6543** (`postgres.fupmqaqbusfosyuiovqe@aws-…pooler.supabase.com:6543/postgres`) ;
   - `DIRECT_URL` : même hôte, pooler **session**, port **5432**.
   Pas l'hôte `db.fupmqaqbusfosyuiovqe.supabase.co` : il est en IPv6 seulement, et Vercel ne le joint pas.
4. **Plan.** L'offre gratuite plafonne la base à 500 Mo et le trafic sortant à 5 Go par mois. Vérifie
   aussi les sauvegardes incluses : pour une économie de jeu réelle, le plan Pro est le minimum raisonnable.

## 1. Geler les écritures

1. **Mettre le projet Vercel en pause** (depuis le dashboard Vercel, ou demande-le à Claude, qui le fait par l'API Vercel).
   Les crons s'arrêtent aussi. Le site est déjà en panne, la pause n'enlève rien aux joueurs.
2. **Seulement ensuite**, débloquer Neon (plan payant, ou attendre la remise à zéro du quota).

## 2. Copier

```bash
# URL directe Neon (sans -pooler) : la DIRECT_URL actuelle de .env
export SOURCE_URL='postgresql://…neon.tech/…?sslmode=require'
# Pooler Supabase en mode SESSION (5432)
export TARGET_URL='postgresql://postgres.fupmqaqbusfosyuiovqe:…@aws-…pooler.supabase.com:5432/postgres'
mkdir -p .migration

# Version de Neon : si 18.x, remplacer postgres:17 par postgres:18 dans toutes les commandes ci-dessous
MSYS_NO_PATHCONV=1 docker run --rm -e SOURCE_URL postgres:17 psql "$SOURCE_URL" -Atc "select version()"

# a. Dump du schéma public (données, index, séquences, _prisma_migrations)
MSYS_NO_PATHCONV=1 docker run --rm -e SOURCE_URL -v "$PWD/.migration:/out" postgres:17 \
  pg_dump "$SOURCE_URL" --format=custom --no-owner --no-privileges --schema=public --file=/out/kiraku.dump

# b. Extension utilisée par les index trigrammes (pas incluse dans un dump limité à public)
MSYS_NO_PATHCONV=1 docker run --rm -e TARGET_URL postgres:17 \
  psql "$TARGET_URL" -v ON_ERROR_STOP=1 -c "create extension if not exists pg_trgm with schema public;"

# c. Restauration en une transaction : tout ou rien. Le CREATE SCHEMA public est écarté (il existe déjà).
MSYS_NO_PATHCONV=1 docker run --rm -e TARGET_URL -v "$PWD/.migration:/out" postgres:17 sh -c \
  'pg_restore --list /out/kiraku.dump | grep -v "SCHEMA - public" > /out/restore.list &&
   pg_restore --dbname="$TARGET_URL" --no-owner --no-privileges --single-transaction --exit-on-error --use-list=/out/restore.list /out/kiraku.dump'
```

Si l'étape c échoue, rien n'est écrit. Corrige, puis relance b et c sur la base Supabase encore vide.

## 3. Vérifier : aucune perte

```bash
npx tsx scripts/compare-databases.mts
```

Le script compare les deux bases en lecture seule : nombre de lignes et empreinte md5 du contenu de
**chaque** table (comptes, sessions, cartes, échanges, enchères, journal des Zeni,
`_prisma_migrations`…), valeur de chaque séquence, somme des Zeni. Il doit finir sur
« Aucun écart ». Au moindre ✖, on ne bascule pas.

```bash
DATABASE_URL="$TARGET_URL" DIRECT_URL="$TARGET_URL" npx prisma migrate status   # « Database schema is up to date! »
```

## 4. Durcir Supabase

À lancer dans le SQL Editor de Supabase. La Data API ne doit rien voir. Prisma se connecte en
propriétaire des tables, donc une RLS sans politique ne le bloque pas (vérifié en répétition).

```sql
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end $$;
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
```

Puis Advisors → Security : plus d'alerte « RLS disabled ». L'alerte « extension in public » sur
`pg_trgm` est attendue : les index la référencent sous `public`.

Une future migration Prisma qui crée une table la crée **sans** RLS : relancer le bloc `do $$ … $$`
après chaque `migrate deploy` qui ajoute des tables.

## 5. Basculer

1. **Vercel → Settings → Environment Variables**, en Production (et en Preview si tu l'utilises) :
   - `DATABASE_URL` = pooler transaction (6543) ;
   - `DIRECT_URL` = pooler session (5432) ;
   - supprimer les variables laissées par l'intégration Neon s'il y en a (`DATABASE_URL_UNPOOLED`,
     `POSTGRES_URL_NON_POOLING`, `POSTGRES_*`, `PG*`, `NEON_*`). Si l'intégration Neon les gère,
     la déconnecter d'abord, sinon elle les remet. Si une URL Neon reste, `check-deploy-env` arrête
     le build (« bases différentes »).
2. Fusionner la PR `migration-supabase` dans `main`. `vercel-build` lance `prisma migrate deploy`
   (rien à appliquer) et les seeds idempotents (ils ne créent que ce qui manque).
3. Vérifier que le déploiement est **Ready**, puis **réactiver le projet**.
4. Test rapide : connexion d'un compte existant (la session doit tenir), ouverture d'un booster,
   Marché, un échange en cours, `/admin`.
5. Mettre à jour `.env` / `.env.local` avec les URL Supabase (la base locale est aussi la prod).

## 6. Après

- **Politique de confidentialité** : `seed-legal` ne touche pas aux pages déjà publiées. Publier une
  nouvelle version de `/confidentialite` depuis `/admin`, avec « **Supabase** (base de données) —
  Irlande, UE (eu-west-1) » à la place de Neon, en FR et en EN.
- Les enchères et échanges arrivés à échéance pendant la panne sont réglés par le cron
  `/api/cron/market` de 04 h, comme d'habitude.
- Garder Neon intact au moins 7 jours, puis repasser en gratuit ou le supprimer.
- Supprimer `.migration/kiraku.dump` : il contient toutes les données des joueurs.

## Retour arrière

- **Avant la réactivation (étape 5.3)** : remettre les anciennes variables Neon et promouvoir le
  déploiement précédent (Instant Rollback). Rien n'est perdu, Neon n'a pas bougé.
- **Après la réactivation** : les nouvelles écritures sont sur Supabase. Revenir à Neon les perdrait.
  On corrige donc en avant, sur Supabase.

## Sauvegardes quotidiennes (plan gratuit)

Le plan gratuit Supabase ne fait aucune sauvegarde. Le workflow `.github/workflows/backup.yml`
en fait une chaque nuit (03 h 17 UTC) : dump du schéma `public`, chiffré en AES-256, gardé 7 jours
comme artefact GitHub. Coût : ~15 Mo de trafic Supabase par jour.

**Mise en place (une fois)** : GitHub → dépôt → Settings → Secrets and variables → Actions →
*New repository secret* :
- `BACKUP_DATABASE_URL` : l'URL du pooler en **mode session** (port 5432), la même que `DIRECT_URL` ;
- `BACKUP_PASSPHRASE` : une longue phrase secrète, à garder aussi **hors de GitHub** (gestionnaire
  de mots de passe). Sans elle, les sauvegardes sont illisibles.

Puis Actions → « Sauvegarde base » → *Run workflow* pour vérifier qu'un premier artefact apparaît.

## Restaurer une sauvegarde

1. Actions → « Sauvegarde base » → le run voulu → *Artifacts* : télécharger et dézipper
   `kiraku-<date>.dump.gpg` dans `.migration/` (dossier ignoré par git).
2. Déchiffrer :
   ```bash
   gpg --decrypt --output .migration/kiraku.dump .migration/kiraku-<date>.dump.gpg
   ```
3. Restaurer dans une base **vide** (nouveau projet Supabase, ou Postgres local pour inspecter) :
   même commandes que les étapes 2.b et 2.c ci-dessus, avec l'image `postgres:17` et `TARGET_URL`
   vers cette base. Restaurer par-dessus la base en service écraserait les données récentes :
   restaurer à côté, comparer avec `scripts/compare-databases.mts`, puis basculer comme à
   l'étape 5.
4. Refaire le durcissement de l'étape 4, puis supprimer `.migration/kiraku.dump`.
