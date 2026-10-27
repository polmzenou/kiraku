# Polices des images de partage

Satori (le moteur de `next/og`) ne lit pas le WOFF2 : ces TrueType sont générés par
`npm run fonts:og` (`scripts/og-fonts.mts`).

- Dela Gothic One, Shippori Mincho B1 (800) et Zen Kaku Gothic New (500, 700) : mêmes
  sous-ensembles latins que `app/fonts`.
- Yuji Syuku : repart de `fonts/source/YujiSyuku-Regular.ttf`, réduite aux kanji de
  `lib/seal-glyphs.ts` et des cadres d'avatar (`lib/profile/frames.ts`).

Toutes sont sous licence OFL ; les licences et copyrights d'origine sont dans `app/fonts`.
Relance `npm run fonts:og` après un ajout de kanji de sceau ou de cadre.
