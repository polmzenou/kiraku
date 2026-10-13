// Petits formats d'affichage partagés par la fuda et le wiki.

/** « 0042 » : numéro de carte sur quatre chiffres (plus si le catalogue dépasse 9 999). */
export function cardNumber(rank: number | null): string {
  return rank === null ? "—" : String(rank).padStart(4, "0");
}

/** Titre de série selon la langue : anglais en /en quand AniList en a un, sinon romaji. */
export function seriesTitle(series: { titleRomaji: string; titleEnglish: string | null }, locale: string): string {
  return locale === "en" && series.titleEnglish ? series.titleEnglish : series.titleRomaji;
}
