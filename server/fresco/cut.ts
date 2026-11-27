import "server-only";
import { cropToGrid, DEFAULT_GRID, FRESCO_MIN_HEIGHT, FRESCO_MIN_WIDTH, FRESCO_WIDTH, tiles, type Grid } from "@/lib/fresco/grid";

// Découpe d'une fresque envoyée par l'admin : orientée, recadrée au format de la grille (4:3), ramenée à
// 2400 × 1800 au plus, puis découpée en fragments WebP. Plus un aperçu de 48 px, flouté, pour l'onglet
// Nouveautés : il ne laisse deviner que les couleurs.

export type CutFresco = {
  width: number;
  height: number;
  full: Buffer;
  teaser: Buffer;
  pieces: { position: number; data: Buffer }[];
};

export class FrescoCutError extends Error {
  constructor(readonly code: "IMAGE_TOO_SMALL" | "IMAGE_INVALID") {
    super(code);
  }
}

const TEASER_WIDTH = 48;

export async function cutFresco(bytes: Uint8Array, grid: Grid = DEFAULT_GRID): Promise<CutFresco> {
  const { default: sharp } = await import("sharp");
  let oriented: { data: Buffer; info: { width: number; height: number } };
  try {
    oriented = await sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().toBuffer({ resolveWithObject: true });
  } catch {
    throw new FrescoCutError("IMAGE_INVALID");
  }
  const crop = cropToGrid(oriented.info.width, oriented.info.height, 0.5, grid);
  if (crop.width < FRESCO_MIN_WIDTH || crop.height < FRESCO_MIN_HEIGHT) throw new FrescoCutError("IMAGE_TOO_SMALL");
  const width = Math.min(FRESCO_WIDTH, crop.width);
  const height = Math.round((width * grid.rows) / grid.cols);
  const base = await sharp(oriented.data).extract(crop).resize({ width, height, fit: "fill" }).toBuffer();
  const [full, teaser, pieces] = await Promise.all([
    sharp(base).webp({ quality: 86 }).toBuffer(),
    sharp(base)
      .resize({ width: TEASER_WIDTH, height: Math.round((TEASER_WIDTH * grid.rows) / grid.cols), fit: "fill" })
      .blur(1.2)
      .webp({ quality: 60 })
      .toBuffer(),
    Promise.all(
      tiles(width, height, grid).map(async (t) => ({
        position: t.position,
        data: await sharp(base).extract({ left: t.left, top: t.top, width: t.width, height: t.height }).webp({ quality: 86 }).toBuffer(),
      })),
    ),
  ]);
  return { width, height, full, teaser, pieces };
}
