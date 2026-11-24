import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REFERRAL_IMAGES, themedImage } from "./assets";

// Registre des images du parrainage v2 et de l'Ennichi : chaque entrée pointe vers un fichier de public/.

describe("images du parrainage v2", () => {
  it("chaque image du registre existe dans public/", () => {
    const missing = Object.values(REFERRAL_IMAGES).filter((img) => !existsSync(join(process.cwd(), "public", img.src)));
    expect(missing).toEqual([]);
  });

  it("les 26 images de la fiche sont là, toutes en dimensions connues", () => {
    const ids = new Set(Object.keys(REFERRAL_IMAGES).map((key) => key.split("/")[0]));
    expect(ids.size).toBe(26);
    expect(Object.values(REFERRAL_IMAGES).every((img) => img.width > 0 && img.height > 0)).toBe(true);
  });

  it("choisit la version du thème et de l'appareil", () => {
    expect(themedImage("hero", "washi", "telephone")?.src).toBe("/images/referral/hero-washi-telephone-v1.webp");
    expect(themedImage("hero", "yoru", "ordinateur")?.width).toBe(2400);
    expect(themedImage("inconnue", "yoru")).toBeNull();
  });
});
