# Communauté Discord Kiraku

## Accueil, rôles, marché et saisons classées

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
DISCORD_ROLES_CHANNEL_ID="1565778506120433664"
DISCORD_MERCHANT_ROLE_ID="1565817691132928121"
DISCORD_COLLECTOR_ROLE_ID="1565818296002154506"
DISCORD_FIGHTER_ROLE_ID="1565818436355887214"
DISCORD_LINKED_ROLE_ID="1565817846720757880"
DISCORD_RANKED_CHANNEL_ID="1565818050631176202"
DISCORD_ALERTS_CHANNEL_ID="1565779152106291380"
DISCORD_GUIDE_CHANNEL_ID="1565843323854258276"
```

Les identifiants et la clé publique ci-dessus sont publics. `DISCORD_BOT_TOKEN` reste secret et doit déjà être
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
le rôle Membre fixé dans l'environnement depuis ce bouton, et conserve les autres rôles. Les membres encore en
attente de la validation native de Discord doivent la terminer avant l'attribution.

Le message publié est enregistré en base : une nouvelle publication l'actualise. S'il a été
supprimé sur Discord, la prochaine publication le recrée.

### Activer les rôles de préférences et de compte lié

1. Ajouter les six nouvelles variables `DISCORD_ROLES_CHANNEL_ID`, `DISCORD_MERCHANT_ROLE_ID`,
   `DISCORD_COLLECTOR_ROLE_ID`, `DISCORD_FIGHTER_ROLE_ID`, `DISCORD_LINKED_ROLE_ID` et
   `DISCORD_RANKED_CHANNEL_ID` dans l'environnement de l'application du VPS.
2. Appliquer `npm run db:deploy`, puis `npm run build` et `pm2 restart kiraku --update-env`.
   La migration `20261030140000_discord_roles_ranked` ajoute la file des comptes liés et le
   classement figé des saisons. Ne pas la lancer sur la base locale obsolète.
3. Placer **Marchand**, **Collectionneur**, **Fighter** et **Joueur Kiraku vérifié** sous le rôle du
   bot. Ces quatre rôles n'ont besoin d'aucune permission de gestion. Le bot conserve **Gérer les rôles**.
4. Dans `#rôles`, donner au bot **Voir le salon**, **Voir l'historique**, **Envoyer des messages**
   et **Intégrer des liens**. Les membres peuvent lire et cliquer sans pouvoir écrire.
5. Dans Kiraku → **Administration → Discord**, cliquer sur **Publier ou actualiser le choix des rôles**.
   Le message propose trois boutons d'ajout/retrait et un bouton **Vérifier mon compte**.

| Rôle | Effet |
| --- | --- |
| Marchand | Notifications des nouvelles ventes et annonces d'échange. Aucun verrou d'accès au marché. |
| Collectionneur | Badge d'intérêt pour la collection, sans notification automatique pour le moment. |
| Fighter | Notification du bilan de saison et du début de la suivante. |
| Joueur Kiraku vérifié | Attribué automatiquement après liaison Discord à un compte Kiraku actif. |

Le rôle **Marchand** n'est pas requis pour voir le marché : les permissions de **Membre** continuent
de déterminer cet accès. Pour notifier les rôles sans les rendre mentionnables par tous, autoriser
**Mentionner @everyone, @here et tous les rôles** au **compte du bot seulement** dans `#marché`
et `#ranked`. Le code limite les mentions au rôle Marchand ou Fighter concerné ; les mises à jour
de prix, enchères ou statut ne renvoient pas de notification.

Le choix de préférences exige le rôle Membre et ne peut ajouter que les trois rôles configurés.
Un rôle ayant reçu des permissions de gestion est refusé. Aucun bouton ne permet de demander
arbitrairement un autre rôle. **Joueur Kiraku vérifié** ne se choisit pas : le serveur relit la liaison
OAuth actuelle dans Kiraku. Les comptes invités, bannis ou en cours de suppression sont exclus.

Le cron existant rattrape progressivement les comptes déjà liés, puis les revérifie chaque jour.
Il retire ce seul rôle si le compte n'est plus lié ou éligible. Un utilisateur absent du serveur
n'est jamais ajouté au serveur. Après son arrivée et l'acceptation du règlement, le bot refait
la vérification ; le bouton **Vérifier mon compte** permet également de la demander immédiatement.
La validation native de Discord doit être terminée avant toute attribution.

### Activer les bilans de saisons dans #ranked

1. Donner au bot **Voir le salon**, **Voir l'historique**, **Envoyer des messages**,
   **Intégrer des liens** et **Joindre des fichiers** dans `#ranked`. Les membres restent en lecture seule.
2. Dans **Administration → Discord**, ouvrir **Voir l'aperçu du classement en image**. Cet aperçu privé
   utilise le classement actuel ; il n'envoie rien sur Discord et ne clôt aucune saison.
3. Activer **Annoncer les fins et débuts de saison sur Discord**, puis **Enregistrer**.
4. Conserver le cron `/api/cron/discord` exécuté chaque minute : aucune deuxième tâche n'est nécessaire.

Lors de la clôture, le classement est enregistré **dans la transaction, avant le reset des PC**.
L'image reprend le podium et les dix premiers joueurs publics, leur pseudo, avatar disponible,
rang et points finaux, avec les emblèmes Kiraku. Les profils privés conservent leur position mais
leur identité n'apparaît pas. Les ex æquo suivent la règle Grand Champion du jeu.

Pour une clôture de saison 4, le message annonce **Fin de la saison 4 !**, affiche le classement final,
puis **Début de la saison 5 ! Bon courage à tous !**. Il mentionne Fighter lors de la première
publication. Une seule annonce persistante est associée à chaque saison ; un échec Discord est
réessayé par le cron, sans refaire le classement avec les scores de la saison suivante.

Le cron clôt une saison arrivée à échéance même si personne n'ouvre le jeu. Une clôture anticipée
depuis l'administration produit aussi un bilan. Les saisons closes avant cette migration n'ont
pas de classement figé : elles ne sont pas publiées rétroactivement. L'activation prend effet
pour les prochaines clôtures, sans annoncer immédiatement un faux début de saison.

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

### Guide #bien-débuter

Le salon `1565843323854258276`, dans **👋 ACCUEIL**, contient le guide public : règlement,
liaison du compte, rôles de préférences, marché, échanges, propositions AR/Gold, ranked et aide.
Les boutons ouvrent Kiraku, Mon compte et le marché. Le salon est en lecture seule pour les
membres. Donner au compte du bot **Voir le salon**, **Voir l'historique**, **Envoyer des messages**
et **Intégrer des liens** dans ce salon.

Pour afficher le contenu préparé, puis le publier ou actualiser le message du bot sans doublon :

```bash
node --import tsx scripts/setup-discord-community.mts guide
node --import tsx scripts/setup-discord-community.mts guide --apply
```

Le script utilise `DISCORD_GUIDE_CHANNEL_ID` (sinon l'identifiant Kiraku ci-dessus) et pointe par
défaut vers `https://kiraku-kun.com`, y compris lorsqu'il est exécuté depuis un environnement local.
`--origin=https://…` permet de choisir explicitement une autre origine HTTPS.

### Alertes techniques privées dans #logs-bot

Le salon d'équipe **#logs-bot** (`1565779152106291380`) est réutilisé ; aucun salon de gros tirages
n'est ajouté. Les administrateurs, développeurs et modérateurs le lisent ; @everyone et Membre
ne doivent pas pouvoir le voir. Le compte du bot a un accès explicite pour voir, lire l'historique,
envoyer et intégrer des liens. Les rôles de préférences n'ont aucun accès supplémentaire.

1. Ajouter `DISCORD_ALERTS_CHANNEL_ID="1565779152106291380"` à l'environnement de l'application du VPS.
2. Appliquer `npm run db:deploy` (migration `20261030150000_discord_technical_alerts`), construire
   avec `npm run build`, puis redémarrer `pm2 restart kiraku --update-env`.
3. Dans **Administration → Discord → Alertes techniques privées**, cliquer sur
   **Tester le salon des alertes**. Le test vérifie que le salon appartient au serveur et que seuls
   les rôles de l'équipe et le bot ont un accès explicite en lecture.
4. Garder le cron Discord existant. Les alertes sont traitées après sa réponse HTTP, avec un budget
   séparé du marché. Aucun cron supplémentaire n'est nécessaire.

Incidents couverts : publication Discord (ventes, échanges, règlement, rôles ou saison), synchronisation
du rôle de compte lié, attribution d'un rôle par bouton, génération/publication d'un bilan et erreur
d'un traitement du cron. L'alerte présente une référence interne, le statut HTTP, la dernière occurrence,
un compteur et une piste de correction. Elle n'inclut aucun jeton, corps brut d'erreur ou nom de joueur.

Une ligne `DiscordAlert` regroupe chaque type/source d'incident. Le premier incident est envoyé au
prochain passage ; les répétitions et résolutions actualisent le même message au maximum toutes les
15 minutes, sans mention générale. Un incident résolu avant sa première publication n'est pas envoyé.
La lease et le nonce de `DiscordPost` restent utilisés pour les envois concurrents et les reprises.
Si le salon des alertes échoue, le bot ne produit pas d'alerte sur cette alerte : il réessaie plus tard
et conserve un avertissement PM2.

Ces alertes complètent les logs PM2 : elles ne constituent pas une surveillance externe de l'arrêt de
l'application ou du cron. Si la base est indisponible, l'incident ne peut pas y être mis en file ; PM2
reste alors la source de diagnostic. Si le jeton Discord lui-même ne fonctionne plus, le même bot ne
peut plus publier les alertes.

### AutoMod natif, après le guide et les alertes

Le script prépare quatre règles natives, avec blocage du message et alerte dans **#logs-bot** :

- **Kiraku · Spam** : filtre de spam de Discord.
- **Kiraku · Mentions massives** : cinq mentions uniques maximum, protection contre les raids de mentions.
- **Kiraku · Insultes et propos haineux** : liste française courte et modifiable dans Discord ou `lib/discord/automod.ts`.
- **Kiraku · Invitations publicitaires** : invitations `discord.gg`, `discord.com/invite` et `discordapp.com/invite`.

Les rôles de l'équipe sont exemptés ; Membre, Marchand, Collectionneur, Fighter et Joueur Kiraku vérifié
ne le sont pas. Il n'y a pas de bannissement ou d'exclusion temporaire automatique. Les listes de mots
ne remplacent pas une décision de modération contextualisée.

Le bot doit disposer de **Gérer le serveur** pour lire et créer ces règles. Ce droit peut être retiré
après l'installation : Discord continue d'appliquer AutoMod nativement. Le bot n'en a pas besoin pour
les rôles, le marché, les bilans et les alertes techniques. Prévisualiser puis appliquer :

```bash
node --import tsx scripts/setup-discord-community.mts automod
node --import tsx scripts/setup-discord-community.mts automod --apply
```

Les règles créées par ce bot sont actualisées lors d'une réexécution. Les filtres de spam ou de
mentions déjà créés par une autre personne sont conservés et signalés ; s'ils sont désactivés, le
script le précise et il faut les activer dans Discord. Aucun filtre existant n'est supprimé.
Les règles se consultent et s'ajustent dans **Paramètres du serveur → AutoMod / Configuration de sécurité**.

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

Le statut attendu est HTTP 200. `synced` et `failed` concernent le marché ; `linkedRoles.synced`
et `linkedRoles.deferred` concernent les rôles de compte lié ; `ranked.published` et `ranked.failed`
concernent les bilans de saisons. Un résultat 0/0 peut aussi signifier que le relais est désactivé,
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
