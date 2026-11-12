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

## À faire une seule fois

1. **Nginx** : reporter `deploy/nginx.conf.example` dans la config du site (upstream avec le secours sur
   3001), puis `sudo nginx -t && sudo systemctl reload nginx`. Sans ça, le déploiement marche quand même,
   mais les joueurs voient quelques secondes d'erreur 502 pendant le redémarrage.
2. **Pare-feu** : l'app écoute sur toutes les interfaces, comme `next start` aujourd'hui. Les ports 3000 et
   3001 ne doivent pas être ouverts sur Internet (seul Nginx y accède) :
   `sudo ufw status` doit autoriser 22, 80 et 443 seulement.
3. **Statut de la CI** (pour sauter la vérification des types) : soit `gh auth login` sur le VPS, soit un
   jeton GitHub en lecture seule (droit « Checks: read » sur le dépôt) dans `~/.config/kiraku/github-token`
   (`chmod 600`). Sans l'un ou l'autre, le script ne peut pas lire la CI d'un dépôt privé : il garde
   simplement la vérification des types, comme avant.
4. **Premier déploiement** : `bash deploy/deploy.sh`. Le `kiraku` actuel (`next start` dans `~/kiraku`) est
   remplacé par la release, sans coupure. Ensuite, `pm2 startup` (si ce n'est pas déjà fait) pour que pm2
   relance la release au redémarrage du VPS.

Les crons (`deploy/crontab.example`) continuent d'appeler `127.0.0.1:3000` : rien à changer.

## En cas de souci

- `pm2 logs kiraku` (ou `kiraku-standby` pendant une bascule) : erreurs au démarrage.
- La release en ligne : `readlink ~/kiraku-releases/current`.
- Le script s'est arrêté au milieu : relire son dernier message ; il dit si la version en ligne a changé.
