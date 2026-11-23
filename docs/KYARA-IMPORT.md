# Import Kyara : procédure de l'équipe et routes de Kyara

Principe et règles : section « Import Kyara » de `docs/PLAN.md`. Ce document sert à l'équipe qui traite la file
et à la maintenance du favori.

## Traiter les demandes

Le joueur clique « Demander l'import » sur Kiraku (rien à coller), puis, sur Kyara, ajoute le compte Kiraku en ami et
clique « Montrer ma collection » dans leur conversation (Amis, onglet des messages). Être ami ne suffit pas : sans ce
clic, Kyara refuse la collection (`403 not_shared`). Côté équipe, rien à préparer par demande :

1. Sur kyara.games, connecte-toi au compte « Kiraku » et accepte les demandes d'ami. La notification « … te montre sa
   collection » signale un joueur prêt.
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
   - **Refus de Kyara** : le favori affiche la raison et n'ouvre pas Kiraku. « Collection pas encore partagée »
     (`not_shared`) : le joueur doit cliquer « Montrer ma collection » dans votre conversation, puis tu recliques le
     favori.
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
| `GET /api/me` | `Authorization: Bearer <kyara_token>` | `id` (uuid du compte connecté) : reconnaît son propre profil |
| `GET /api/me/friends/<uuid>/collection?page=N` | `Authorization: Bearer <kyara_token>` | `items[]` (`characterId` ou `id`, `qty`, `rarity`), `total`, `more` ; `403 not_shared` tant que le joueur n'a pas cliqué « Montrer ma collection » |
| `GET /api/me/collection?lean=1&page=N` | `Authorization: Bearer <kyara_token>` | sa propre collection (essai) : tableau de `characterId`, `qty`, sans rareté |
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
- La route d'un ami n'avait pas pu être essayée (un seul compte Kyara) : voir l'essai du 23/11.

## Essai du 23/11 (production, compte « Kiraku » et compte d'un joueur)

- Une fois la demande d'ami acceptée, le joueur est dans `friends[]` de `GET /api/me/friends` (`id`, `pseudo`, `avatar`,
  `since`…). La réponse a aussi `incoming`, `outgoing`, `blocked` et `max` : le nombre d'amis est plafonné (valeur non
  relevée), d'où le retrait des joueurs traités.
- Être ami ne suffit pas : la collection d'un ami répond `403 {"error":"not_shared","message":"Cette collection n’est pas
  partagée avec toi"}` tant que le joueur n'a pas cliqué « Montrer ma collection » dans sa conversation avec le compte
  Kiraku (Amis, onglet des messages). Le partage se fait ami par ami (« ✓ Collection partagée ») et le compte Kiraku
  reçoit la notification « … te montre sa collection ». Après ce clic, le favori a lu la collection et l'import a été
  versé.
- Une route inconnue répond `404 {"error":"not_found"}` (`/api/friends/<uuid>/collection` et
  `/api/users/<uuid>/collection` n'existent pas).
- Sa propre collection (`/api/me/collection?lean=1`) arrive sans rareté (`characterId`, `qty`, `locked`, `firstAt`,
  `resaleLocked`, `resaleUntil`, `listable`, `sellBlock`). Le favori la complète par `GET /api/characters`, mais lors d'un
  essai sur son propre profil aucune carte n'est passée (pseudo et Discord lus, collection vide) : la réponse du
  catalogue n'a sans doute plus la forme attendue. Cela ne touche que l'essai sur son propre profil ; à recaler en
  relevant la réponse de `/api/characters` si on en a besoin.
- Version 3 du favori : un refus affiche la raison de Kyara. La version 2 marche encore, sans ce détail.

## Reste à essayer

- [ ] La pagination de la collection d'un ami (`page`, `more`, `total`) avec une collection de plusieurs pages, et les
  champs d'un élément (variantes ?). `total` compte-t-il les personnages ou les exemplaires ?
- [ ] Un avatar par défaut (sans ID Discord) : ce que renvoie le profil public.
- [ ] Le favori dans Firefox et Edge.
- [ ] Les codes d'erreur restants : ami absent, profil inconnu, session expirée.
- [ ] La taille du lot pour la plus grosse collection disponible.
- [ ] La valeur du plafond d'amis (`max` de `/api/me/friends`).
- [ ] Les CGU de Kyara sur l'accès automatisé.

Recaler ensuite `lib/kyara/bookmarklet.ts` (et son test, qui simule ces réponses) sur ce qui a été observé.
