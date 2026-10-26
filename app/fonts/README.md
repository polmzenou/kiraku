# Polices d'interface

Shippori Mincho B1 (700/800) et Zen Kaku Gothic New (400/500/700) proviennent des WOFF2
latins servis par Google Fonts et téléchargés par `next/font/google` dans le build audité le
16 octobre 2026. Ils ont été réduits avec `subset-font` aux caractères latins et à la ponctuation
de l'interface française/anglaise ; les noms de fichiers contiennent la graisse.

Dela Gothic One (400, titres h1 et h2) a été réduite le 26 octobre 2026 avec `subset-font` depuis
le TTF de google/fonts, aux plages U+0020–007E, U+00A0–00FF, à Œ œ Ÿ et à la ponctuation
typographique (’ « » – — … · €, espaces insécables). La police n'a qu'une graisse : elle est
déclarée sur la plage 400–900 pour que `font-bold`/`font-extrabold` n'ajoutent pas de faux gras.

Les licences OFL et les copyrights d'origine sont conservés à côté des WOFF2 :

- Source Dela Gothic : <https://github.com/google/fonts/tree/main/ofl/delagothicone>.
- Source Shippori : <https://github.com/google/fonts/tree/main/ofl/shipporiminchob1>.
- Source Zen Kaku : <https://github.com/google/fonts/tree/main/ofl/zenkakugothicnew>.

Le chargement local garde les familles de la direction artistique sans envoyer les centaines
de règles `unicode-range` japonaises et leurs préchargements. Les autres écritures utilisent les
polices de repli du système. Les sceaux gardent leur sous-ensemble Yuji Syuku, généré par
`scripts/subset-seal-font.mts` à partir de `fonts/source/YujiSyuku-Regular.ttf`.

Les six petits sous-ensembles latins sont préchargés pour stabiliser le premier rendu ; Yuji
Syuku garde `preload: false`. Le build ne dépend plus de Google Fonts pour ces familles.
