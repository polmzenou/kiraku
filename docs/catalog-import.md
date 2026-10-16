# Étendre le catalogue AniList

Pour ajouter des personnages sans rééquilibrer les cartes existantes, préparer l'import :

```powershell
node --import tsx scripts/import-characters.mts --limit 10000 --preserve-existing --stage-only
```

Les pages sont enregistrées dans le staging et l'aperçu est écrit dans
`.import/staged-preview.json`. Le catalogue public et les pools de boosters restent inchangés.
Une interruption se reprend avec la même commande.

Le mode `--preserve-existing` insère uniquement les personnages absents de la base. Aucune
carte ni œuvre existante n'est réécrite : identifiants, numéros, raretés, statistiques, noms
et images restent inchangés, même si AniList les modifie ou ne les renvoie plus.
Les nouveaux personnages reçoivent les raretés et statistiques prévues par les réglages actuels,
selon leur popularité dans le catalogue agrandi. Leurs numéros suivent le dernier numéro existant.
Le nombre d'ajouts est limité aux places restantes pour atteindre l'objectif total.

Après vérification de l'aperçu, publier le staging sans rappeler AniList :

```powershell
node --import tsx scripts/import-characters.mts --limit 10000 --preserve-existing --finalize-only
```

La publication est transactionnelle, revérifie les cartes existantes sous verrou et actualise
`catalog.size`. Le script recalcule ensuite les pools des boosters avec leurs filtres habituels.
Les collections, découvertes, annonces et soldes des joueurs ne sont pas modifiés par l'import.
Le wiki détecte le nouvel import finalisé pour renouveler son cache sans redéploiement.

Pour une simulation sans aucune écriture en base, utiliser `--dry-run` à la place de
`--stage-only`. Cette simulation charge le catalogue de départ pour calculer les vrais ajouts.
