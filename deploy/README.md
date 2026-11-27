# Déployer Kiraku sur le VPS

Une mise à jour = une commande, lancée dans `~/kiraku` sur le VPS, une fois la PR fusionnée sur `main` :

```bash
bash deploy/deploy.sh
```

Les joueurs ne sont pas coupés : le site continue de tourner pendant le build, puis passe sur la nouvelle
version en quelques secondes, sans erreur, une fois qu'elle répond.

## Ce que fait le script

1. **Code** : `git pull --ff-only`.
2. **Dépendances** : `npm ci` seulement si `package-lock.json` a changé depuis le dernier déploiement.
3. **Build**, en priorité basse (`nice`) pour que le site en ligne garde le processeur. Si la CI
   (lint, types, tests : le contrôle `checks`) est verte pour ce commit, le build ne refait pas la
   vérification des types ; sinon il la fait, comme avant. Le cache de build de Next (`.next/cache`) est
   gardé : seuls les fichiers modifiés sont recompilés.
4. **Migrations** : `prisma migrate deploy`, avant la bascule. Une migration doit donc rester compatible
   avec la version encore en ligne pendant quelques minutes (ajouter une colonne ou une table : oui ;
   renommer ou supprimer : en deux déploiements).
5. **Release** : le serveur autonome de Next (`output: "standalone"`) est copié dans
   `~/kiraku-releases/releases/<date>-<commit>`, avec `public/`, les fichiers JS/CSS, et ceux de la version
   précédente (un joueur resté sur une page ouverte avant la mise à jour les charge encore).
6. **Bascule** : la nouvelle version démarre d'abord en secours (`kiraku-standby`, port 3001). Si elle ne
   répond pas (`/api/health` et l'accueil), le déploiement s'arrête et rien ne change pour les joueurs.
   Sinon `kiraku` (port 3000) redémarre sur la nouvelle version ; pendant ces secondes, Nginx envoie les
   joueurs au secours. Le secours est ensuite arrêté et `pm2 save` enregistre la nouvelle release.
7. **Ménage** : les 3 releases les plus récentes sont gardées.

## Options

| Commande | Effet |
| --- | --- |
| `bash deploy/deploy.sh --seed` | lance aussi les seeds de départ (types de boosters, pages légales), comme l'ancien build Vercel |
| `bash deploy/deploy.sh --typecheck` | garde la vérification des types même avec une CI verte |
| `bash deploy/deploy.sh --rollback` | revient à la release précédente en quelques secondes (sans build ; les migrations restent) |
| `bash deploy/deploy.sh --restart` | redémarre la release en ligne sans coupure (secours sur 3001, puis 3000) : rend la mémoire, applique les réglages pm2 ci-dessous ; garde son `.env` |

Le retour arrière reprend la release précédente telle quelle, avec le `.env` copié à son build : si un secret a
changé depuis (mot de passe de la base, clé d'un service), corriger d'abord le `.env` de cette release.

## Mémoire

Le VPS a 3,8 Go de RAM pour l'app, Postgres et le build. Le 27/11/2026, le seul processus Next tenait 1,9 Go au
bout de 18 h (swap entamé) : ~650 Mo de tas JavaScript, ~630 Mo d'arènes malloc gardées par les threads de sharp,
le reste en tampons. Le script démarre donc l'app avec :

- `MALLOC_ARENA_MAX=2` : deux arènes malloc au plus, au lieu d'une par thread (16 sur 2 cœurs) ;
- `--max-old-space-size=1024` (`KIRAKU_HEAP_MB`) : tas JavaScript borné (Node le laisse sinon monter vers 2 Go) ;
- `--max-memory-restart 1600M` (`KIRAKU_MAX_MEMORY`) : filet ; au-delà, pm2 redémarre le processus (quelques
  secondes d'erreurs, le secours n'étant pas lancé).

sharp est réglé dans `server/media/sharp.ts` (sans cache d'opérations, un thread par image). Pour suivre :
`pm2 show kiraku` (Used Heap Size) et `grep RssAnon /proc/$(pgrep -f next-server)/status`. Si la mémoire remonte
jour après jour, `bash deploy/deploy.sh --restart` la rend sans coupure en attendant d'en trouver la cause.

## Changer une variable d'environnement

Le build recopie `~/kiraku/.env` (et `.env.production` s'il existe) dans la release : l'app en ligne lit sa copie,
pas le fichier de `~/kiraku`. Après un ajout ou un changement dans `~/kiraku/.env`, lancer `bash deploy/deploy.sh`
(build, puis bascule sans coupure). Un `pm2 restart kiraku` relancerait la release en ligne avec son ancien fichier,
et un `npm run build` seul ne change rien à ce qu'elle sert.

## À faire une seule fois

1. **Nginx** : reporter `deploy/nginx.conf.example` dans la config du site (upstream avec le secours sur
   3001), puis `sudo nginx -t && sudo systemctl reload nginx`. Sans ça, le déploiement marche quand même,
   mais les joueurs voient quelques secondes d'erreur 502 pendant le redémarrage.
2. **Pare-feu** : l'app écoute sur toutes les interfaces, comme `next start` aujourd'hui. Les ports 3000 et
   3001 ne doivent pas être ouverts sur Internet (seul Nginx y accède) :
   `sudo ufw status` doit autoriser 22, 80 et 443 seulement.
3. **Statut de la CI** (pour sauter la vérification des types) : le dépôt étant public, l'API GitHub répond
   sans jeton (60 requêtes par heure et par IP). Au-delà, ou si le dépôt redevient privé : `gh auth login` sur le
   VPS, ou un jeton GitHub en lecture seule (droit « Checks: read » sur le dépôt) dans
   `~/.config/kiraku/github-token` (`chmod 600`). Sans réponse lisible, le script garde simplement la
   vérification des types.
4. **Premier déploiement** : `bash deploy/deploy.sh`. Le `kiraku` actuel (`next start` dans `~/kiraku`) est
   remplacé par la release, sans coupure. Ensuite, `pm2 startup` (si ce n'est pas déjà fait) pour que pm2
   relance la release au redémarrage du VPS.

Les crons (`deploy/crontab.example`) continuent d'appeler `127.0.0.1:3000` : rien à changer.

## En cas de souci

- `pm2 logs kiraku` (ou `kiraku-standby` pendant une bascule) : erreurs au démarrage.
- La release en ligne : `readlink ~/kiraku-releases/current`.
- Le script s'est arrêté au milieu : relire son dernier message ; il dit si la version en ligne a changé. Une
  release inachevée (copie interrompue, version qui n'a pas répondu) est effacée, pour qu'un retour arrière ne
  tombe jamais dessus.

## Sauvegarde de la base

`deploy/backup.sh`, lancé chaque nuit par cron (`deploy/crontab.example`, 03 h 17) :

- dump de la base de l'app (`pg_dump` au format custom), dans le conteneur Postgres `kiraku-db` s'il tourne, avec
  l'URL que lit l'app (`DIRECT_URL`, sinon `DATABASE_URL`, du `.env` de la release en ligne), jamais affichée ;
- chiffré à la volée (gpg, AES-256, phrase de passe) : aucune copie en clair n'est écrite sur le disque ;
- vérifié : déchiffrement complet, table des matières lisible, tables `User` et `_prisma_migrations` présentes ;
- gardé dans `~/kiraku-backups/` : les 7 dernières quotidiennes et 4 hebdomadaires (la première de chaque
  semaine), chacune avec son empreinte `.sha256` ;
- copié hors du serveur si une destination est réglée ; journal dans `~/kiraku-backups/backup.log`.

Réglages, codes de sortie et détail : `bash deploy/backup.sh --help`. Pendant le dump (une à deux minutes), une
migration qui modifie une table attendrait sa fin en bloquant cette table : ne pas déployer vers 03 h 17 (heure
du VPS).

L'ancienne sauvegarde par GitHub Actions (`.github/workflows/backup.yml`) visait encore Supabase et n'a jamais
abouti (toutes ses exécutions depuis le 26/10/2026 ont échoué) : elle est retirée.

### Installation (une fois, sur le VPS)

1. **Phrase de passe**, à garder AUSSI dans le gestionnaire de mots de passe : la perdre, c'est perdre toutes
   les sauvegardes.
   ```bash
   mkdir -p ~/.config/kiraku
   (umask 077; openssl rand -base64 36 > ~/.config/kiraku/backup-passphrase)
   cat ~/.config/kiraku/backup-passphrase   # à copier dans le gestionnaire
   ```
2. **Contrôle** : `bash deploy/backup.sh --check` affiche la base visée, l'outil de dump, la place sur le disque
   et la copie hors du serveur. L'utilisateur doit pouvoir lancer `docker` sans sudo (c'est le cas si
   `docker ps` répond).
3. **Première sauvegarde** à la main : `bash deploy/backup.sh` (journal à l'écran, code 0 attendu : `echo $?`).
4. **Cron** : ajouter la ligne « Sauvegarde de la base » de `deploy/crontab.example` avec `crontab -e`.
5. **Le lendemain** : `tail ~/kiraku-backups/backup.log`.
6. **GitHub** : supprimer les secrets `BACKUP_DATABASE_URL` et `BACKUP_PASSPHRASE` (Settings → Secrets and
   variables → Actions). Tant que le retrait du workflow n'est pas arrivé sur `main` (GitHub lance les tâches
   planifiées depuis la branche par défaut), le désactiver : Actions → « Sauvegarde base » → menu ⋯ →
   *Disable workflow*.

### Copie hors du serveur (à choisir)

Sans copie ailleurs, une sauvegarde sur le disque du VPS ne protège ni d'une panne de ce disque, ni d'une perte
ou d'une compromission du VPS. Tant qu'aucune n'est réglée, le journal le rappelle à chaque passe. Les archives
sont chiffrées : elles peuvent être stockées n'importe où.

- **Stockage objet OVH (S3)**, de préférence dans une autre région que le VPS : un conteneur Object Storage et
  un utilisateur S3 (Public Cloud), `sudo apt install rclone`, puis `rclone config` (type `s3`, fournisseur
  « Other », point d'accès S3 indiqué par OVH pour la région, clés de l'utilisateur ; nommer la destination
  `ovh`). Enfin, dans `~/.config/kiraku/backup.conf` (`chmod 600`) : `KIRAKU_BACKUP_REMOTE="ovh:kiraku-backups"`.
  Chaque archive y est copiée, avec la même rotation ; `KIRAKU_BACKUP_REMOTE_PRUNE=0` pour n'y rien effacer
  (clés sans droit de suppression, ou règle de cycle de vie du stockage).
- **Une autre machine qui vient chercher les archives** (PC, NAS, second serveur) : une tâche planifiée y lance
  chaque matin `rsync -a ubuntu@<vps>:kiraku-backups/ <dossier>/` (ou `scp`). Le VPS n'a aucun accès à cette
  copie : même compromis, il ne peut pas l'effacer.
- **Toute autre destination rclone** (serveur en SFTP, Google Drive…), réglée comme le stockage objet.

Puis `bash deploy/backup.sh --check` : « destination rclone joignable ».

### Surveillance (conseillée)

Une sauvegarde qui échoue sans que personne ne le voie ne protège de rien. Avec un service de surveillance
de tâches planifiées (healthchecks.io ou équivalent) : une vérification quotidienne, puis
`KIRAKU_BACKUP_PING_URL="<adresse donnée par le service>"` dans `~/.config/kiraku/backup.conf`. Le script
l'appelle à chaque succès et appelle `<adresse>/fail` en cas d'échec ; le service prévient aussi quand rien
n'arrive (cron cassé, VPS éteint).

### Tester une restauration (sur un PC, jamais sur la prod)

Après l'installation, puis une fois par mois : une sauvegarde jamais restaurée n'est pas une sauvegarde. Dans
Git Bash (gpg inclus), Docker Desktop démarré, dans un dossier hors du dépôt (l'archive contient les données des
joueurs) :

```bash
mkdir -p ~/kiraku-restore && cd ~/kiraku-restore
# 1. La dernière archive et son empreinte (depuis le VPS ou la copie hors du serveur)
scp 'ubuntu@<vps>:kiraku-backups/daily/kiraku-<date>.dump.gpg*' .
sha256sum -c kiraku-<date>.dump.gpg.sha256
# 2. Base jetable, sans port ouvert sur la machine
docker run -d --name kiraku-restore-test -e POSTGRES_PASSWORD=restore-test postgres:17
until docker exec kiraku-restore-test pg_isready -U postgres -q; do sleep 1; done
docker exec kiraku-restore-test createdb -U postgres kiraku
# 3. Déchiffrement (gpg demande la phrase de passe) et restauration d'un seul tenant, sans fichier en clair
gpg --decrypt kiraku-<date>.dump.gpg | docker exec -i kiraku-restore-test \
  pg_restore -U postgres -d kiraku --no-owner --no-privileges --single-transaction --exit-on-error
# 4. Contrôles
docker exec kiraku-restore-test psql -U postgres -d kiraku -At \
  -c 'SELECT count(*) FROM "User"' \
  -c 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL' \
  -c 'SELECT max("createdAt") FROM "CoinTransaction"' \
  -c 'SELECT sum(coins) FROM "User"'
# 5. Ménage
docker rm -f kiraku-restore-test
```

Attendu : la restauration se termine sans erreur ; autant de joueurs qu'en prod à peu près ; autant de migrations
que de dossiers `prisma/migrations/2…` du commit alors en ligne ; le dernier mouvement de Zeni juste avant l'heure
de l'archive ; la somme des Zeni proche de celle de `/admin/economie` à ce moment-là.

### En cas de perte de la base

Restaurer dans une base **vide**, jamais par-dessus la base en service : si elle tourne encore, restaurer à côté
et comparer avec `scripts/compare-databases.mts` avant toute décision.

1. `pm2 stop kiraku` : plus aucune écriture pendant la restauration.
2. Une base vide, du nom et de l'utilisateur de l'URL de l'app (nouveau conteneur Postgres 17, ou `createdb`).
3. `gpg --decrypt <archive> | docker exec -i kiraku-db pg_restore -U <utilisateur> -d <base> --no-owner
   --single-transaction --exit-on-error` (en tant qu'utilisateur de l'app : les objets lui appartiennent).
4. Depuis `~/kiraku` : `npx prisma migrate status`, puis `bash deploy/deploy.sh` (il applique les migrations
   plus récentes que l'archive et relance l'app). Tout ce qui s'est passé depuis l'archive (jusqu'à un jour) est
   perdu : à annoncer aux joueurs.
