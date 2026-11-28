import { cellCount, cellOf, type Grid } from "./grid";

// Masque d'une fresque incomplète : la forme des fragments possédés, d'un seul tenant, rétrécie puis floutée pour
// que chaque bord tourné vers une case vide s'efface en douceur (coins rentrants compris). Un seul masque pour
// tous les fragments : entre deux fragments voisins, aucun joint ni double transparence. Le pourtour de la fresque,
// lui, est fondu à part (fresco.css) : ici, les fragments du bord débordent du cadre pour ne pas y être rognés.

const CELL = 100;
/** Retrait puis flou, en unités d'un fragment de 100 : le fondu finit avant le bord de la case vide (~16 %). */
const ERODE = 8;
const BLUR = 4;
/** Débord des fragments du pourtour, hors du cadre : le retrait ne les entame pas de ce côté. */
const BLEED = 60;

/** Image SVG du masque (texte), ou null si la fresque est complète (le fondu du pourtour suffit). */
export function gapMaskSvg(owned: ReadonlySet<number>, grid: Grid): string | null {
  const total = cellCount(grid);
  if (owned.size >= total) return null;
  const rects: string[] = [];
  for (const position of [...owned].sort((a, b) => a - b)) {
    if (position < 0 || position >= total) continue;
    const { row, col } = cellOf(position, grid);
    // Un pixel de recouvrement entre voisins : la forme reste d'un seul tenant
    const x0 = col === 0 ? -BLEED : col * CELL - 1;
    const y0 = row === 0 ? -BLEED : row * CELL - 1;
    const x1 = col === grid.cols - 1 ? grid.cols * CELL + BLEED : (col + 1) * CELL + 1;
    const y1 = row === grid.rows - 1 ? grid.rows * CELL + BLEED : (row + 1) * CELL + 1;
    rects.push(`<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}"/>`);
  }
  const w = grid.cols * CELL;
  const h = grid.rows * CELL;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">` +
    `<filter id="f" x="-50%" y="-50%" width="200%" height="200%"><feMorphology operator="erode" radius="${ERODE}"/><feGaussianBlur stdDeviation="${BLUR}"/></filter>` +
    `<g filter="url(#f)" fill="#fff">${rects.join("")}</g></svg>`
  );
}

/** Le masque en valeur CSS (url de données), à poser dans --fr-gaps. */
export function gapMaskCss(owned: ReadonlySet<number>, grid: Grid): string | null {
  const svg = gapMaskSvg(owned, grid);
  return svg ? `url("data:image/svg+xml,${encodeURIComponent(svg)}")` : null;
}
