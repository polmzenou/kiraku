# Import Kyara : procédure de l'équipe et routes de Kyara

Principe et règles : section « Import Kyara » de `docs/PLAN.md`. Ce document sert à l'équipe qui traite la file
et à la maintenance du favori.

## Traiter les demandes

Le joueur clique « Demander l'import » sur Kiraku (rien à coller), puis ajoute le compte Kiraku en ami sur Kyara et
lui montre sa collection. Côté équipe, rien à préparer par demande :

1. Sur kyara.games, connecte-toi au compte « Kiraku » et accepte les demandes d'ami.
2. Ouvre le profil d'un ami et clique ton favori « Envoyer à Kiraku ». Il lit sa collection et ouvre la page de
   réception de Kiraku, qui vérifie ta clé et retrouve la demande par l'ID Discord de l'avatar Kyara.
   - **Lecture sûre** : les cartes et les Zeni sont versés tout de suite, le joueur est prévenu.
   - **Lecture douteuse** : la collection est gardée dans l'onglet « À vérifier » de `/admin/kyara`, avec le motif
     (avatar sans ID Discord, aucune carte lue, lecture incomplète). Sur la fiche : « Verser », « Relire sur Kyara » ou
     « Refuser » avec un motif.
   - **Avatar sans ID Discord** (avatar par défaut) : la page te demande de choisir la demande du joueur et de
     confirmer ; compare les pseudos. La collection attend ensuite dans « À vérifier ».
   - **Aucune demande en attente** pour ce Discord : le joueur n'a pas demandé l'import sur Kiraku, ou son compte Kyara
     n'utilise pas le même Discord. Rien n'est gardé.
3. Reviens sur Kyara (page précédente) pour l'ami suivant. Retire de tes amis les joueurs traités.

Un membre de l'équipe ne traite jamais sa propre demande. Le profil Kyara du compte Kiraku lui-même est refusé.

## Installer son favori

Chaque membre de l'équipe a son favori, avec sa propre clé. Dans `/admin/kyara`, « Générer mon favori », puis
« Copier le favori » : crée un favori dans ton navigateur et colle le texte copié comme adresse. La clé n'est montrée
qu'une fois (seule son empreinte est en base) ; favori perdu, ou clé à changer : « Générer un nouveau favori », l'ancien
cesse de marcher. Ne le partage pas : un lot n'est accepté que s'il vient du favori du membre connecté à Kiraku, ce qui
protège la page de réception d'un lien piégé.

Secours : « Copier le code console », à coller dans la console de kyara.games (F12) sur le profil de l'ami ; le lot
affiché se colle sur la page de réception.

Après chaque changement du favori, `BOOKMARKLET_BUILD` augmente (`lib/kyara/bookmarklet.ts`) et chacun en génère un
nouveau. Un favori d'un ancien format est refusé (« Favori trop ancien »).

## Routes de Kyara utilisées

Ce ne sont pas des routes officielles : elles viennent de projets tiers et peuvent changer sans préavis.

| Route | Accès | Champs lus |
| --- | --- | --- |
| `GET /api/users/<uuid>` | public | `pseudo`, `avatar` (`https://cdn.discordapp.com/avatars/<id Discord>/<hash>.png`) |
| `GET /api/me/friends/<uuid>/collection?page=N` | `Authorization: Bearer <kyara_token>` | `items[]` (`characterId` ou `id`, `qty`, `rarity`), `total`, `more` |
| `GET /api/characters` | public | `id`, `rarity` (`C`, `U`, `R`, `E`, `L`, `M`), seulement si les cartes lues n'ont pas de rareté |

Notre serveur n'appelle jamais ces routes : il reçoit `403 {"error":"verification_required"}`. Seul le navigateur
connecté de l'équipe les lit.

## Essai du 22/11 (un seul compte Kyara, app locale)

Parcours complet réussi avec la première version (lien de traitement par demande) : demande, favori, réception,
versement (55 personnages lus, 13 cartes et 383 Zeni). La version simplifiée garde les mêmes routes et le même favori,
sans le lien.

- Le favori s'exécute sur kyara.games (Chrome) ; les `fetch` lancés depuis la page passent la vérification anti-robots.
- `GET /api/me` renvoie l'id du compte (l'uuid du profil) ; `GET /api/me/collection?lean=1` renvoie la collection.
- L'avatar du profil public contient l'ID Discord, identique à celui lié à Kiraku.
- Les ids Kyara sont bien des ids AniList : 41 personnages sur 55 reconnus. Les 14 autres, tous des Communes, n'existent
  pas dans notre catalogue (23418, 42363, 77175, 124033, 131093, 131387, 131569, 132727, 160227, 161007, 189160, 230268,
  295292, 354398).
- **Pas encore essayé : la route d'un ami** (`/api/me/friends/<uuid>/collection`), celle de la production, où le compte
  Kiraku lit la collection d'un autre joueur. Il faut un second compte Kyara.

## Reste à essayer (deux vrais comptes Kyara)

Avec un compte « Kiraku » et un compte joueur ayant au moins deux pages de collection :

- [ ] Le joueur ajoute le compte Kiraku en ami : faut-il accepter la demande ? « Montrer ma collection » se règle-t-il
  par ami ou pour tous ? Y a-t-il un plafond d'amis ?
- [ ] La route de la collection d'un ami, sa pagination (`page`, `offset`, curseur ?) et les champs d'un élément
  (id AniList, quantité, rareté, variantes ?). `total` compte-t-il les personnages ou les exemplaires ?
- [ ] Le profil public : l'avatar contient-il l'ID Discord ? Et pour un avatar par défaut ?
- [ ] Un `fetch` lancé depuis la console ou le favori passe-t-il la vérification anti-robots, avec quels en-têtes ?
- [ ] Le favori s'exécute-t-il dans Chrome, Firefox et Edge ? `location.assign` vers kiraku-kun.com fonctionne-t-il ?
- [ ] Les codes d'erreur : ami absent, collection masquée, profil inconnu, session expirée.
- [ ] La taille du lot pour la plus grosse collection disponible.
- [ ] Les CGU de Kyara sur l'accès automatisé.

Recaler ensuite `lib/kyara/bookmarklet.ts` (et son test, qui simule ces réponses) sur ce qui a été observé.
