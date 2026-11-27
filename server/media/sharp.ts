import "server-only";

// sharp (libvips), fourni par Next.js en dépendance optionnelle, réglé une fois pour un petit serveur : sans le cache
// d'opérations de libvips (chaque image n'est traitée qu'une fois ; les data URI sont gardées par server/og/assets.ts)
// et un seul thread de travail par image. Sur le VPS (2 cœurs), les threads de libvips gardaient chacun leur arène
// malloc : ~630 Mo jamais rendus au système (relevé du 27/11/2026 ; deploy/deploy.sh pose aussi MALLOC_ARENA_MAX).

export type Sharp = (typeof import("sharp"))["default"];

let sharpModule: Promise<Sharp | null> | null = null;

/** sharp réglé, ou null s'il manque sur cette machine. */
export function loadSharp(): Promise<Sharp | null> {
  sharpModule ??= import("sharp")
    .then((m) => {
      const sharp = m.default;
      // Les doubles des tests n'ont que la fonction
      sharp.cache?.(false);
      sharp.concurrency?.(1);
      return sharp;
    })
    .catch(() => null);
  return sharpModule;
}
