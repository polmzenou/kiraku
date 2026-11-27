# Catalogue administrateur

Le module `/admin/catalogue` permet de créer une carte, de la dupliquer, de la modifier
et de l’archiver. Les nouvelles cartes sont des brouillons ; **Publier** les rend visibles
dans le wiki et éligibles uniquement aux types de boosters sélectionnés. Restaurer une
archive la remet en brouillon. Les exemplaires et historiques ne sont jamais supprimés.

## Installation

1. Installer les dépendances avec `npm ci` et générer Prisma avec `npx prisma generate`.
2. Valider la migration isolément avec `npm test -- server/catalog/migration.test.ts`,
   puis contrôler la base cible avant `npm run db:deploy`. Les URL `DATABASE_URL` et
   `DIRECT_URL` restent inchangées ; local et production peuvent partager la même base.
   Redémarrer `npm run dev` après migration. Aucun merge Git n’est nécessaire pour le SQL.
3. Dans le tableau de bord Vercel, créer un stockage **Blob public** (le service de stockage reste chez
   Vercel, même avec l’application sur le VPS) et copier son jeton de lecture-écriture.
4. Ajouter `BLOB_READ_WRITE_TOKEN` et `BLOB_PUBLIC_HOST` aux environnements concernés (en production :
   `~/kiraku/.env` sur le VPS). Le second est le domaine exact du stockage, par exemple
   `mon-stockage.public.blob.vercel-storage.com`, sans protocole ni chemin.
5. Redéployer (`bash deploy/deploy.sh` sur le VPS) pour actualiser les domaines autorisés pour les images.

Sans Blob, la création de brouillons et l’édition des autres champs restent possibles.
L’envoi d’une nouvelle image affiche une erreur de configuration et conserve le formulaire.
Les fichiers JPEG, PNG et WebP sont limités à 4 Mio, réduits à 1600 pixels sur leur plus grand
côté et convertis en WebP dans le navigateur. Le serveur contrôle leur signature avant stockage.
Les images ont des URL uniques ; un remplacement ne modifie pas un fichier déjà mis en cache.
Les images déjà enregistrées sont conservées, y compris lors d’un archivage.

## Compatibilité avec la version déployée

La migration est additive : le type SQL `Rarity` et les quatre anciennes colonnes `rarity`
restent présents, avec leurs six valeurs et leurs index. Le nouveau registre utilise des
colonnes supplémentaires `rarityKey` ; Prisma expose toujours ce champ sous le nom `rarity`.
Des triggers synchronisent les deux représentations. Pour une rareté personnalisée, la
valeur de compatibilité est copiée depuis son modèle lors de la création de la rareté.
Les anciennes requêtes avec `::"Rarity"` restent exécutables. Les cartes importées conservent
leur numéro AniList ; les créations originales utilisent des identifiants à partir d’un milliard.

Compatibilité du schéma et isolation des données sont différentes : créer ou éditer une carte
dans une base partagée modifie ses données pour tous les environnements qui la lisent. Le
propriétaire a choisi de conserver la base partagée après contrôle de compatibilité.
La migration ne crée aucune carte de test et ne modifie ni les taux ni les paramètres
économiques. Elle ajoute les six définitions et initialise uniquement les nouvelles colonnes.
L’ajout de raretés et la publication de cartes personnalisées doivent être coordonnés avec
le déploiement du nouveau code : une ancienne interface ne connaît pas ces nouveaux paliers.

`npm run db:deploy` applique les migrations à la base configurée ; sur le VPS, `deploy/deploy.sh`
le fait aussi, après la construction et avant la bascule. Ne jamais exécuter les tests de mutations `*.db.test.ts`
contre cette base partagée : ils restent réservés à `DATABASE_URL_TEST`.

L’import habituel reste `npm run catalog:import`. L’import complet
rééquilibre les personnages AniList ; `--preserve-existing` conserve les personnages déjà
présents. Les deux ignorent les cartes originales, conservent leurs propres raretés et
protègent les champs modifiés dans l’admin via `adminOverrides`.

La version initiale non appliquée a été remplacée par cette version additive avant son
application. Une fois appliqué, le fichier de migration ne doit plus être modifié.

Contrôle du 19 octobre 2026 sur la base partagée : migration appliquée avec succès, 24 migrations
à jour ; nombres de lignes et empreintes des anciennes données identiques sur les neuf tables
contrôlées, dont 10 000 cartes et 9 088 exemplaires. Le client Prisma de la version précédente
(`c3dd28a`) lit toujours les cartes, gros tirages, lots et missions avec l’enum historique.
Le script `scripts/check-catalogue-migration.mts` effectue uniquement des lectures et conserve
les empreintes dans `reports/catalogue/migration-before.json` et `migration-after.json`.

## Raretés et probabilités

`/admin/catalogue/raretes` ajoute de vrais paliers ordonnés. Les clés sont stables et les
noms sont traduits. Chaque rareté porte des paramètres visuels héritables par les cartes ;
les paramètres économiques restent dans `GameSetting`. Les six raretés existantes sont
conservées avec leurs paramètres actuels. L’import AniList continue d’attribuer ces six
raretés et ignore les cartes personnalisées. Les champs d’une carte importée enregistrés
dans l’admin sont protégés individuellement lors des imports suivants.

Le poids de carte vaut 1 par défaut ; 0 l’exclut de tous les tirages et garanties.
Le poids global d’une rareté répartit les tirages ordinaires ; les planchers et garanties
peuvent encore la viser si ce poids est nul. Les cartes supérieures à Mythique satisfont
le seuil de pitié. Les cartes personnalisées incluses explicitement ne deviennent pas
des vedettes : les paramètres de bannière restent indépendants.

L’aperçu des probabilités calcule exactement les chances par emplacement et d’au moins
un exemplaire, avec les poids, replis, vedettes et garanties. Il simule la carte publiée,
même pendant l’édition d’un brouillon. Les scénarios doré/divin et pitié ne sont appliqués
qu’aux types qui les autorisent. Les animations respectent la préférence de mouvements réduits.

## Variantes : raretés AR et Gold

Deux raretés au-dessus de Mythique (migration `20261020200000_catalogue_variantes_ar_gold`) :
**AR** (`異`, forme alternative : Luffy Gear 5, Ichigo Bankai, Naruto Baryon…) puis **Gold** (`煌`,
artwork entièrement doré). Leur colonne historique `rarity` vaut Mythique (`legacyBase`), ce qui
garde l'ancien code compatible. Elles portent `variantRequired` : une carte de ces raretés pointe
vers une carte de base (`Card.variantOfId`, sans chaîne de variantes) et a **sa propre image**.
Le serveur refuse l'image de la base ou une image vide, dès le brouillon. `formName` (« Gear 5 »)
s'affiche sur la fuda à la place de la série, et le wiki relie la base à ses formes publiées.
Une base qui a des variantes ne peut pas être supprimée (clé étrangère `RESTRICT`).

Depuis la fiche d'une carte de base, « Créer la version AR / Gold » ouvre un brouillon prérempli
(nom, série, description, métadonnées, boosters). L'image, l'apparence et le statut restent à choisir.
Le rendu Gold vire l'image à l'or (`appearance.artTone = "gold"`, hérité de la rareté), et chaque carte
peut repasser en « Naturel » si son image est déjà dorée.

Taux par défaut : AR 8 et Gold 2 sur 99 975, pris sur les 25 parts Mythique (Mythique 15).
« Mythique ou mieux », la pitié et le taux à long terme ne changent donc pas. Tant qu'aucune carte
AR ou Gold n'est publiée dans un pool, ces tirages retombent sur Mythique, et la part vedette s'applique
à la rareté réellement servie. La migration ajoute les clés manquantes aux réglages déjà enregistrés
sans écraser une valeur existante : recyclage ×3 et ×7 la valeur Mythique, passifs, cadeaux et échanges.
L'ouverture leur donne la cérémonie Mythique (`fxTier`), plus un effet propre à chacune.

## Raretés visuelles : MR, VR, XR et BR

Quatre variantes (migration `20261102120000_raretes_visuelles`) qui suivent les règles ci-dessus : carte de base,
image propre, révélation propre (ci-dessous). Le préréglage est dans `appearance` de la rareté (`VISUAL_PRESETS`) : l'holographie
à 0,25, et chaque carte peut le surcharger. L'inclinaison 3D reste celle de toutes les fuda.

**Rangs : BR = Mythique < AR = VR < Gold = MR < XR**, portés par `sortOrder` (500, 600, 700, 800). À rang égal, la
rareté de base passe d'abord dans le registre (`compareRarities`), car tirages, pitié et missions comparent des
positions : une BR compte donc comme « Mythique ou mieux ». Une rareté reprend les réglages de son rang (recyclage,
passifs, plafond de prix, anticipation de la révélation) ; XR est au-dessus : 15 fois le recyclage Mythique et un
passif de plus que Gold. Les stats 力 et 気 restent propres à chaque carte : le CRUD propose la médiane de la rareté,
sinon celle de son rang, sinon un palier au-dessus du rang publié juste en dessous (`suggestedStats`).

Elles sont livrées au **poids 0** : aucune n'est tirée tant qu'un poids n'est pas réglé dans l'admin. Un tirage sans
carte publiée redescend à la rareté précédente du registre : BR → Mythique, VR → AR, MR → Gold, XR → MR.

| Rareté | Sceau | Image | Matière de la carte |
| --- | --- | --- | --- |
| MR Manga Rare | 漫 | Fournie en noir et blanc | Papier blanc, nuages en trame grise, encre noire, liseré rouge |
| VR Vitrail Rare | 彩 | Fournie en vitrail | Nacre lilas, contours d'or, nuée du sceau violette |
| XR Xtreme Rare | 極 | Image pleine carte | Full Art : nom posé sur l'image, fin filet irisé |
| BR Black Rare | 闇 | Fournie sur fond noir | Laque noire, contours d'argent, liseré rouge |

MR, VR et BR n'appliquent aucun filtre : l'image reste telle qu'elle a été envoyée. Leur matière se règle dans
`scripts/fuda-face-css.mjs` (encres, banc, nuée du sceau) et `app/globals.css` (cadre). Le XR accepte une image
détourée facultative (`appearance.cutoutUrl`, même cadrage que l'image), posée devant le cadre, sous
le nom et les reflets : le nom reste toujours entier.

### Révélations plein écran

Dans la pile du rituel, ces quatre raretés jouent leur propre mise en scène (`components/opening/RevealScene.tsx`,
déroulé dans `lib/opening/reveal-scenes.ts`) : **BR** brouillard noir, **MR** le mot MANGA écrit au pinceau puis
retournement, **VR** lumière divine depuis le haut de l'écran, **XR** écran coupé en X puis tunnel holographique.
Tout part du début de la charge, avec un calque sous la pile et un au-dessus ; le compteur, les boutons et le reste
de la pile s'effacent le temps de la scène. En effets allégés, moins de calques et rien qui tourne en continu ; en
mouvement réduit, aucune scène. L'aperçu de la fiche et la boutique gardent la cérémonie Mythique. Le rayon qui sort
du booster reste celui des Mythiques. La fumée du BR vient de `npm run fx:assets` (`public/fx/`).

## Esprit (SR 霊) : la carte spectrale

Cinquième rareté visuelle (migration `20261118160000_rarete_esprit`), une variante comme les autres : carte de base,
image propre. **Rang 750 : MR < Esprit < XR**, seule à son rang. Elle forme donc un palier à elle seule partout où le
registre groupe les raretés par rang (expéditions, pile ou face) : une XR est maintenant deux paliers au-dessus de
Gold/MR. Un tirage XR sans carte publiée redescend sur l'Esprit, puis sur MR.

Réglages posés par la migration sans écraser l'existant :
- poids de tirage : la moyenne arrondie au-dessus des poids de MR et XR (un peu plus rare que MR, un peu moins que XR) ;
  tant qu'aucune Esprit n'est publiée, ces tirages redescendent sur MR ;
- recyclage : la moyenne de MR et XR (1 650 Zeni par défaut) ;
- passifs : autant que MR ;
- plafond de prix : celui de MR.

Elle rejoint aussi les listes autorisées (cadeaux, échanges, ventes, pile ou face), l'anti-doublons s'il protège les
Mythiques, et les ultis si MR en a.

**Carte spectrale** (`appearance.spectral`, préréglage `{ fullArt: true, spectral: true }`). Elle s'inspire de la
Decay Card de React Bits, réécrite pour Kiraku :
- `lib/fx/spectral.ts` : un shader WebGL2 qui déforme l'illustration par une turbulence de bruit (plus fort quand le
  pointeur bouge, un souffle au repos sur les bords), ronge les bords de la carte, la teinte de brume froide et peint
  le voile sous le nom ;
- `components/fuda/SpectralCanvas.tsx` : le canvas, monté par `SpectralArt` seulement sur une grande carte vivante,
  à l'écran, sans mouvement réduit ni spoiler masqué, et avec une place libre (4 contextes WebGL au plus,
  `lib/fx/gl-budget.ts`) ;
- `components/fuda/FudaSpectral.css` : partout ailleurs (grilles, cartes figées, sans WebGL2, image sans en-tête CORS),
  un bord brumeux fixe (masque SVG bruité), un voile froid et un souffle d'opacité lent.

Trois curseurs dans l'apparence (rareté ou carte) : déformation, grain du brouillard, souffle au repos. La couleur du
cadre, si elle est réglée, teinte la brume.

**Révélation.** Dans la pile du rituel, la nuit tombe (brume `public/fx/mist.webp`, tirée de `npm run fx:assets`). Des
feux follets (hitodama) s'allument et tournent autour du dos, qui vacille puis s'efface. À la charge, pas de
retournement : les feux follets plongent dans la carte, qui apparaît comme un fantôme. Le canvas fait monter sa
présence en 1,6 s depuis des volutes, pendant que la carte vacille et se pose. Puis viennent le sceau 霊 et le nom.
Hors de la pile (récap à plusieurs boosters, aperçu de l'admin), une carte spectrale se forme aussi dans son canvas
quand elle se retourne. Le banc `/admin/test-ouverture` a un scénario « Esprit ».

## Liste, actions groupées et suppression

La liste se trie (modification, nom, rareté, puissance, numéro), se filtre par type (bases ou
variantes) et affiche des compteurs par statut. Les actions groupées (100 cartes au plus) publient,
archivent, restaurent, changent la rareté, ou ajoutent et retirent un booster. Elles passent par
une seule transaction, avec les mêmes contrôles que l'édition unitaire et une ligne `AdminLog`
par carte. Les cartes refusées sont listées avec leur motif.

La **suppression définitive** est réservée aux créations originales non publiées qui n'ont jamais
rien touché : exemplaire, découverte, souhait, tirage, cadeau, lot, enchère, échange, vedette,
équipe ou variante. Sinon, il faut archiver. L'instantané complet reste dans `AdminLog`, et l'image
Blob est conservée.

## Vérification

`npm test` comprend une migration de l’historique complet sur PostgreSQL embarqué PGlite,
sans connexion à la base configurée de l’application. Les autres tests d’intégration
restent réservés à `DATABASE_URL_TEST` et ne doivent jamais viser une base de production.

Chaque écriture du catalogue est journalisée dans `AdminLog`. Les versions de fiches
empêchent l’écrasement d’une édition concurrente. La publication et les pools sont
transactionnels ; les ouvertures vérifient encore les cartes avant distribution.
