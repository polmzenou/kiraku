"use client";

import { cropToGrid, DEFAULT_GRID, FRESCO_MIN_HEIGHT, FRESCO_MIN_WIDTH, FRESCO_WIDTH, tiles, type Grid } from "@/lib/fresco/grid";

// Découpe dans le navigateur de l'admin, pour l'aperçu en direct : mêmes calculs de recadrage et de tuiles
// que le serveur (lib/fresco/grid.ts). Le fichier envoyé est l'image déjà recadrée en 4:3 et réduite : le
// serveur la redécoupe lui-même (il ne fait jamais confiance aux fragments du client).

/** Sous la limite par défaut du proxy (nginx : 1 Mo par corps de requête). */
const UPLOAD_MAX_BYTES = 950_000;
const TEASER_WIDTH = 48;

export type LocalFresco = {
  /** Image à envoyer (4:3, au plus 2400 px de large). */
  upload: File;
  fullUrl: string;
  teaserUrl: string;
  pieces: { position: number; imageUrl: string }[];
  /** Taille d'origine et axe sur lequel le cadrage glisse. */
  source: { width: number; height: number };
};

export class LocalCutError extends Error {
  constructor(readonly code: "IMAGE_INVALID" | "IMAGE_TOO_SMALL") {
    super(code);
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new LocalCutError("IMAGE_INVALID"))), type, quality));
}

/** WebP (JPEG si le navigateur ne sait pas l'encoder), qualité baissée jusqu'à passer sous la limite d'envoi. */
async function compress(canvas: HTMLCanvasElement): Promise<File> {
  for (const quality of [0.9, 0.84, 0.78, 0.7, 0.62]) {
    let blob = await toBlob(canvas, "image/webp", quality);
    if (blob.type !== "image/webp") blob = await toBlob(canvas, "image/jpeg", quality);
    if (blob.size <= UPLOAD_MAX_BYTES || quality === 0.62) return new File([blob], blob.type === "image/webp" ? "fresque.webp" : "fresque.jpg", { type: blob.type });
  }
  throw new LocalCutError("IMAGE_INVALID");
}

export async function cutLocally(file: File, focus: number, grid: Grid = DEFAULT_GRID): Promise<LocalFresco> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new LocalCutError("IMAGE_INVALID");
  }
  try {
    const crop = cropToGrid(bitmap.width, bitmap.height, focus, grid);
    if (crop.width < FRESCO_MIN_WIDTH || crop.height < FRESCO_MIN_HEIGHT) throw new LocalCutError("IMAGE_TOO_SMALL");
    const width = Math.min(FRESCO_WIDTH, crop.width);
    const height = Math.round((width * grid.rows) / grid.cols);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(bitmap, crop.left, crop.top, crop.width, crop.height, 0, 0, width, height);

    const upload = await compress(canvas);
    const pieces = await Promise.all(
      tiles(width, height, grid).map(async (t) => {
        const tile = document.createElement("canvas");
        tile.width = t.width;
        tile.height = t.height;
        tile.getContext("2d")!.drawImage(canvas, t.left, t.top, t.width, t.height, 0, 0, t.width, t.height);
        return { position: t.position, imageUrl: URL.createObjectURL(await toBlob(tile, "image/webp", 0.82)) };
      }),
    );
    const teaser = document.createElement("canvas");
    teaser.width = TEASER_WIDTH;
    teaser.height = Math.round((TEASER_WIDTH * grid.rows) / grid.cols);
    teaser.getContext("2d")!.drawImage(canvas, 0, 0, teaser.width, teaser.height);
    return {
      upload,
      fullUrl: URL.createObjectURL(upload),
      teaserUrl: URL.createObjectURL(await toBlob(teaser, "image/webp", 0.6)),
      pieces,
      source: { width: bitmap.width, height: bitmap.height },
    };
  } finally {
    bitmap.close();
  }
}

/** Libère les adresses locales d'une découpe remplacée. */
export function releaseLocal(local: LocalFresco | null) {
  if (!local) return;
  URL.revokeObjectURL(local.fullUrl);
  URL.revokeObjectURL(local.teaserUrl);
  for (const p of local.pieces) URL.revokeObjectURL(p.imageUrl);
}
