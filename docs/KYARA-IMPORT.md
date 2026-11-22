# Import Kyara : procédure de l'équipe et routes de Kyara

Principe et règles : section « Import Kyara » de `docs/PLAN.md`. Ce document sert à l'équipe qui traite la file
et à la maintenance du favori.

## Traiter une demande

1. Sur kyara.games, connecte-toi au compte « Kiraku ». Accepte la demande d'ami du joueur si besoin.
2. Dans `/admin/kyara`, onglet « En attente », clique « Traiter » sur la demande, puis « Ouvrir le profil sur Kyara ».
   Le lien porte un code à usage unique (`#kiraku=…`), valable 30 minutes et propre à toi.
3. Sur le profil ouvert, clique le favori « Envoyer à Kiraku ». Il lit la collection et te ramène sur la page de
   réception de Kiraku, qui vérifie le code, le profil et le compte Discord.
   - Avatar Kyara sans ID Discord (avatar par défaut) : vérifie le profil à la main avant de confirmer.
   - Discord différent : refuse la demande (« Discord différent »).
4. Sur la fiche, relis l'aperçu, puis « Verser », « Relire sur Kyara » (lecture incomplète) ou « Refuser » avec un motif.
5. Retire le joueur des amis du compte Kiraku sur Kyara.

Un membre de l'équipe ne traite jamais sa propre demande.

## Installer le favori

Dans `/admin/kyara`, « Copier le favori », puis crée un favori dans ton navigateur et colle le texte copié comme
adresse. Secours : « Copier le code console », à coller dans la console de kyara.games (F12) sur le profil ouvert
par « Traiter » ; le lot affiché se colle sur la page de réception.

Après chaque changement du favori, `BOOKMARKLET_BUILD` augmente (`lib/kyara/bookmarklet.ts`) et chacun le recopie.

## Routes de Kyara utilisées (à confirmer : test du lot 0)

Ce ne sont pas des routes officielles : elles viennent de projets tiers et peuvent changer sans préavis.

| Route | Accès | Champs lus |
| --- | --- | --- |
| `GET /api/users/<uuid>` | public | `pseudo`, `avatar` (`https://cdn.discordapp.com/avatars/<id Discord>/<hash>.png`) |
| `GET /api/me/friends/<uuid>/collection?page=N` | `Authorization: Bearer <kyara_token>` | `items[]` (`characterId` ou `id`, `qty`, `rarity`), `total`, `more` |
| `GET /api/characters` | public | `id`, `rarity` (`C`, `U`, `R`, `E`, `L`, `M`), seulement si les cartes lues n'ont pas de rareté |

Notre serveur n'appelle jamais ces routes : il reçoit `403 {"error":"verification_required"}`. Seul le navigateur
connecté de l'équipe les lit.

## Test du lot 0 (deux vrais comptes Kyara)

Avec un compte « Kiraku » et un compte joueur ayant au moins deux pages de collection :

- [ ] Le joueur ajoute le compte Kiraku en ami : faut-il accepter la demande ? « Montrer ma collection » se règle-t-il
  par ami ou pour tous ? Y a-t-il un plafond d'amis ?
- [ ] La route de la collection d'un ami, sa pagination (`page`, `offset`, curseur ?) et les champs d'un élément
  (id AniList, quantité, rareté, variantes ?). `total` compte-t-il les personnages ou les exemplaires ?
- [ ] Le profil public : l'avatar contient-il l'ID Discord ? Et pour un avatar par défaut ?
- [ ] Un `fetch` lancé depuis la console ou le favori passe-t-il la vérification anti-robots, avec quels en-têtes ?
- [ ] Le routeur de Kyara garde-t-il `#kiraku=…` à l'ouverture du profil ?
- [ ] Le favori s'exécute-t-il dans Chrome, Firefox et Edge ? `location.assign` vers kiraku-kun.com fonctionne-t-il ?
- [ ] Les codes d'erreur : ami absent, collection masquée, profil inconnu, session expirée.
- [ ] La taille du lot pour la plus grosse collection disponible.
- [ ] Les CGU de Kyara sur l'accès automatisé.

Recaler ensuite `lib/kyara/bookmarklet.ts` (et son test, qui simule ces réponses) sur ce qui a été observé.
