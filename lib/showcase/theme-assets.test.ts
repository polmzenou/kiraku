import { existsSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SHOWCASE_THEMES, THEME_IDS } from "./theme-registry";

// Les thèmes à fond vidéo pointent vers des fichiers versionnés de public/vitrines/<thème>/ :
// chacun doit exister (refaits par npm run vitrines:assets).
const media = THEME_IDS.flatMap((id) => {
  const m = SHOWCASE_THEMES[id].media;
  return m ? [[id, [m.mobile.still, m.mobile.loop, m.desktop.still, m.desktop.loop]] as const] : [];
});

describe("fonds des thèmes de vitrine", () => {
  it("au moins un thème à fond vidéo", () => {
    expect(media.length).toBeGreaterThan(0);
  });

  it.each(media)("%s : image fixe et boucle, en téléphone et ordinateur", (_, files) => {
    for (const file of files) {
      expect(file).toMatch(/^\/vitrines\/[a-z0-9-]+\/(still|loop)-(mobile|desktop)-v\d+\.(webp|mp4)$/);
      expect(existsSync(`public${file}`), file).toBe(true);
    }
  });

  // Une ancienne version laissée dans le dossier partirait en prod sans servir à rien
  it("public/vitrines ne contient que les fichiers des thèmes", () => {
    const expected = media.flatMap(([, files]) => files.map((file) => file.replace(/^\//, ""))).sort();
    const present = readdirSync("public/vitrines").flatMap((dir) => readdirSync(`public/vitrines/${dir}`).map((name) => `vitrines/${dir}/${name}`));
    expect(present.sort()).toEqual(expected);
  });
});
