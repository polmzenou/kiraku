// Grille d'une fresque, sans base : découpe d'une image en cols × rows tuiles et repères de position.
// Les positions vont de 0 à cols × rows − 1, ligne par ligne (0 = en haut à gauche).

/** Grille des fresques : 4 colonnes × 3 lignes sur une image 4:3, donc des fragments carrés. */
export const FRESCO_COLS = 4;
export const FRESCO_ROWS = 3;

/** Taille de l'image entière gardée (4:3) et d'un fragment carré. */
export const FRESCO_WIDTH = 2400;
export const FRESCO_HEIGHT = 1800;
export const FRESCO_MIN_WIDTH = 1200;
export const FRESCO_MIN_HEIGHT = 900;

export type Grid = { cols: number; rows: number };

export const DEFAULT_GRID: Grid = { cols: FRESCO_COLS, rows: FRESCO_ROWS };

export function cellCount(grid: Grid): number {
  return grid.cols * grid.rows;
}

/** Position → ligne et colonne. */
export function cellOf(position: number, grid: Grid): { row: number; col: number } {
  return { row: Math.floor(position / grid.cols), col: position % grid.cols };
}

export function positionOf(row: number, col: number, grid: Grid): number {
  return row * grid.cols + col;
}

export function isPosition(position: number, grid: Grid): boolean {
  return Number.isInteger(position) && position >= 0 && position < cellCount(grid);
}

/** Positions d'une ligne, d'une colonne. */
export function rowPositions(row: number, grid: Grid): number[] {
  return Array.from({ length: grid.cols }, (_, col) => positionOf(row, col, grid));
}

export function columnPositions(col: number, grid: Grid): number[] {
  return Array.from({ length: grid.rows }, (_, row) => positionOf(row, col, grid));
}

export type Tile = { position: number; left: number; top: number; width: number; height: number };

/**
 * Bornes entières des tuiles d'une image width × height : chaque bord tombe sur round(i × taille / n),
 * si bien que les tuiles se touchent sans trou ni chevauchement et couvrent toute l'image.
 */
export function tiles(width: number, height: number, grid: Grid = DEFAULT_GRID): Tile[] {
  const xs = Array.from({ length: grid.cols + 1 }, (_, i) => Math.round((i * width) / grid.cols));
  const ys = Array.from({ length: grid.rows + 1 }, (_, i) => Math.round((i * height) / grid.rows));
  const out: Tile[] = [];
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      out.push({ position: positionOf(row, col, grid), left: xs[col], top: ys[row], width: xs[col + 1] - xs[col], height: ys[row + 1] - ys[row] });
    }
  }
  return out;
}

/**
 * Recadrage d'une image width × height au format de la grille (cols:rows, 4:3 par défaut). `focus` (0 à 1)
 * place la fenêtre sur l'axe en trop : 0 = bord gauche ou haut, 0,5 = centre, 1 = bord droit ou bas.
 */
export function cropToGrid(width: number, height: number, focus = 0.5, grid: Grid = DEFAULT_GRID): { left: number; top: number; width: number; height: number } {
  const ratio = grid.cols / grid.rows;
  const f = Math.min(1, Math.max(0, Number.isFinite(focus) ? focus : 0.5));
  if (width / height > ratio) {
    const w = Math.round(height * ratio);
    return { left: Math.round((width - w) * f), top: 0, width: w, height };
  }
  const h = Math.round(width / ratio);
  return { left: 0, top: Math.round((height - h) * f), width, height: h };
}

/** L'axe sur lequel le cadrage peut glisser (null si l'image a déjà le bon format, à 1 % près). */
export function cropAxis(width: number, height: number, grid: Grid = DEFAULT_GRID): "x" | "y" | null {
  const ratio = grid.cols / grid.rows;
  const actual = width / height;
  if (Math.abs(actual - ratio) / ratio < 0.01) return null;
  return actual > ratio ? "x" : "y";
}
