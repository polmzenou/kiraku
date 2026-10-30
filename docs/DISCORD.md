# Communauté Discord Kiraku

## Bouton du règlement et annonces du marché

Ces fonctions réutilisent l'application Discord de la connexion Kiraku et son bot. Le serveur
Next.js reçoit les clics par HTTP : pas de processus Discord connecté en permanence. Le bot peut
apparaître hors ligne tout en répondant aux boutons et en publiant les annonces.

Configuration de ce serveur, à ajouter à `.env.local` et à l'environnement de l'application
de production sur le VPS. Kiraku tourne avec PM2 ; `kiraku-db` est le conteneur PostgreSQL.
Ces variables doivent être accessibles à l'application web, pas seulement à PostgreSQL :

```dotenv
DISCORD_PUBLIC_KEY="d5582666c89fe2e64cff7b6d7b7a874c70f1e8cce7ed8f513353aeb5daff7fe2"
DISCORD_GUILD_ID="1565773684243697905"
DISCORD_RULES_CHANNEL_ID="1565778336947634266"
DISCORD_MEMBER_ROLE_ID="1565774539886039142"
DISCORD_MARKET_CHANNEL_ID="1565793902324219925"
```

Les cinq valeurs ci-dessus sont publiques. `DISCORD_BOT_TOKEN` reste secret et doit déjà être
renseigné, ainsi que `AUTH_DISCORD_ID` (la même application que celle de la clé publique).
La clé publique ne remplace ni le jeton du bot ni `AUTH_DISCORD_SECRET`.

### Activer le règlement

1. Appliquer `npm run db:deploy` avec la base du VPS, construire l'application avec `npm run build`,
   puis redémarrer `pm2 restart kiraku --update-env`. Ne pas utiliser la base locale obsolète pour
   cette migration. Le redémarrage est nécessaire après modification de l'environnement.
2. Donner **Gérer les rôles** au bot et placer son rôle au-dessus de **Membre**, sous l'équipe.
3. Dans le salon du règlement, autoriser au bot **Voir le salon**, **Voir l'historique**,
   **Envoyer des messages** et **Intégrer des liens**.
4. Developer Portal → application Kiraku → General Information → **Interactions Endpoint URL** :
   `https://kiraku-kun.com/api/discord/interactions`, puis enregistrer. Discord doit accepter l'URL.
5. Dans Kiraku, ouvrir `/admin/discord`, puis **Publier le bouton du règlement**. Le texte du
   règlement doit déjà être dans Discord : ce bouton publie seulement le message d'acceptation.
6. Tester avec un membre sans rôle d'équipe : accepter le règlement doit ajouter **Membre** et
   rendre les salons accessibles. Le résultat du clic est privé. Un second clic ne retire rien.

Le serveur vérifie la signature Ed25519 du corps brut et son horodatage, l'application,
le serveur, le salon, l'auteur du message et l'identifiant du bouton. Il ne peut attribuer que
le rôle Membre fixé dans l'environnement, et conserve les autres rôles. Les membres encore en
attente de la validation native de Discord doivent la terminer avant l'attribution.

Le message publié est enregistré en base : une nouvelle publication l'actualise. S'il a été
supprimé sur Discord, la prochaine publication le recrée.

### Activer le marché

1. Dans le salon du marché, donner au bot **Voir le salon**, **Voir l'historique**,
   **Envoyer des messages** et **Intégrer des liens**. Les membres restent en lecture seule.
2. Dans `/admin/discord`, activer **Relayer les ventes et les échanges sur Discord**, puis enregistrer.
3. Installer la ligne `/api/cron/discord` de `deploy/crontab.example` sur le VPS : elle est appelée
   chaque minute, avec le même `CRON_SECRET` que les autres tâches.
4. Créer une nouvelle vente de test depuis Kiraku : l'annonce contient l'illustration, la rareté,
   le vendeur public (sinon « Un joueur »), le prix d'enchère, l'achat immédiat disponible, la date
   de fin et un lien vers la fiche exacte de la vente.
5. Créer une nouvelle annonce d'échange : le bot publie l'auteur public, l'illustration et le nom de
   la carte proposée, toutes les cartes recherchées avec leurs raretés (une au choix), l'expiration
   et un lien qui cible cette annonce dans l'onglet Échanges. Le message indique ensuite si l'annonce
   est retirée, échangée, expirée ou si la carte n'est plus disponible.

La file `DiscordPost` est créée dans la transaction de vente ou d'annonce d'échange. L'envoi part après la réponse ;
les échecs sont réessayés avec un délai progressif et le délai imposé par Discord en cas de 429.
Les mises, achats et annulations actualisent le message ; le cron reprend les échecs et les
clôtures différées. Les annonces inchangées ne sont pas renvoyées. Une lease en base évite les
publications concurrentes, et un nonce stable déduplique les créations rapprochées. Après un
envoi incertain, les 100 messages récents sont examinés avant une nouvelle création ; cette
récupération reste limitée à cette fenêtre si le salon reçoit beaucoup de messages.

Le relais est désactivé par défaut. Il concerne les **nouvelles ventes aux enchères avec ou sans
achat immédiat et les nouveaux échanges carte contre carte**. Les anciennes annonces ne sont pas
reprises rétroactivement. Pour les échanges, appliquer aussi la migration
`20261030130000_discord_trade_listings` avant de redémarrer la version qui les relaie.
Le cron s'installe sur l'hôte VPS. Le déploiement PM2 n'installe pas automatiquement le fichier
`deploy/crontab.example`. La procédure ci-dessous appelle l'URL HTTPS publique et ne dépend
ni du port interne de l'application ni du conteneur PostgreSQL.

### Installer le cron Discord sur le VPS (PM2)

Utiliser le même compte SSH pour les commandes suivantes et pour `crontab -e` :

```bash
mkdir -p "$HOME/.config/kiraku"
chmod 700 "$HOME/.config/kiraku"
nano "$HOME/.config/kiraku/cron-secret"
```

Dans le fichier, mettre seulement la valeur de `CRON_SECRET` de l'application (sans nom de variable
ni guillemets). Enregistrer puis fermer ; ne pas partager cette valeur :

```bash
chmod 600 "$HOME/.config/kiraku/cron-secret"
curl -sS --max-time 55 -H "Authorization: Bearer $(cat "$HOME/.config/kiraku/cron-secret")" -w '\nHTTP %{http_code}\n' https://kiraku-kun.com/api/cron/discord
```

Le statut attendu est HTTP 200. `synced` compte les synchronisations réussies ; `failed` indique
les publications non synchronisées. Un résultat 0/0 peut aussi signifier que le relais est désactivé,
que sa configuration est incomplète ou qu'aucune annonce n'est à traiter : il ne prouve pas un envoi.
HTTP 401 indique que le secret fourni ne correspond pas à `CRON_SECRET` de l'application.

Ouvrir ensuite `crontab -e` et ajouter la ligne suivante en conservant les tâches déjà présentes :

```cron
* * * * * curl -fsS --max-time 55 -H "Authorization: Bearer $(cat "$HOME/.config/kiraku/cron-secret")" https://kiraku-kun.com/api/cron/discord >> "$HOME/.config/kiraku/discord-cron.log" 2>&1
```

Après enregistrement, vérifier `crontab -l`, puis après une minute :

```bash
tail -c 2000 "$HOME/.config/kiraku/discord-cron.log"
```

### Annonce absente et erreur Discord 403

Les ventes tentent un envoi immédiatement après la réponse ; attendre le cron ne règle pas un refus
d'accès de Discord. Si PM2 affiche `[discord] publication non synchronisée (403)`, vérifier le salon
`1565793902324219925`. Dans les permissions de ce salon, ajouter directement le compte du bot qui
a publié le bouton du règlement et autoriser explicitement **Voir le salon**, **Voir l'historique**,
**Envoyer des messages** et **Intégrer des liens**. Les droits du bot dans le salon du règlement
ne lui donnent pas automatiquement ceux du marché. Relancer le passage manuel ci-dessus après
correction et après le délai de reprise ; les annonces échouées restent en file.

## Annonces des liaisons Discord

Après la première liaison Discord d'un joueur, le bot Kiraku publie dans le salon configuré :

> 🔗 **Sakura** (@sakura) vient de lier son compte Discord à Kiraku !

Le nom d'affichage et le nom d'utilisateur viennent du profil Discord reçu pendant la connexion.
Une reconnexion ou une nouvelle liaison du même joueur ne produit pas d'annonce. Les comptes
déjà liés avant l'activation ne sont pas annoncés rétroactivement.

## Configuration

1. Ajouter le bot Kiraku au serveur depuis le lien d'installation de l'application Discord.
2. Dans Discord, clic droit sur le salon → **Modifier le salon** → **Permissions** : autoriser
   **Voir le salon** et **Envoyer des messages** pour le bot Kiraku.
3. Dans le [Portail des développeurs Discord](https://discord.com/developers/applications), ouvrir
   **Kiraku** → **Bot**. Copier le jeton si disponible, sinon utiliser **Réinitialiser le jeton**
   (`Reset Token`). Une réinitialisation invalide l'ancien jeton s'il était utilisé ailleurs.
4. Renseigner côté serveur :

   ```dotenv
   DISCORD_BOT_TOKEN="jeton_du_bot"
   DISCORD_LINK_CHANNEL_ID="identifiant_du_salon"
   ```

   Le jeton du bot est différent de `AUTH_DISCORD_SECRET`. Il ne doit pas être partagé, commité,
   ni préfixé par `NEXT_PUBLIC_`.

En local, ajouter ces variables dans `.env.local`, puis redémarrer `npm run dev`.
Sur Vercel, ouvrir le projet → **Paramètres** → **Variables d'environnement**, ajouter les deux
variables pour **Production**, puis redéployer la version contenant ce code. Les libellés Vercel
peuvent être en anglais (`Settings`, `Environment Variables`, `Redeploy`). Configurer les
environnements de test séparément si les annonces doivent aussi y être actives.

## Vérification

Utiliser un compte Kiraku qui n'a encore jamais lié Discord, puis effectuer la liaison. Le message
doit apparaître dans le salon choisi ; une reconnexion ne doit pas ajouter de message.

Le bot utilise l'API HTTP de Discord : aucun processus connecté en permanence n'est requis.
Les annonces sont désactivées tant que les deux variables ne sont pas présentes.

L'envoi se déroule après la réponse, une fois la transaction de liaison validée. Il est limité à
cinq secondes. En cas d'échec, la liaison reste acquise et le serveur écrit un avertissement
`[discord]` : `401` indique généralement un jeton invalide, `403` un accès au salon refusé, et
`404` un salon introuvable ou inaccessible. L'annonce n'est pas réessayée automatiquement.
