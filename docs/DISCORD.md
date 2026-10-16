# Annonces des liaisons Discord

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
