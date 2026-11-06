import { describe, expect, it } from "vitest";
import { SEAL_GLYPHS } from "@/lib/seal-glyphs";
import { ACTION_KANJI, OUTCOME_KANJI } from "./glyphs";

// Un kanji absent du sous-ensemble de Yuji Syuku s'affiche dans une police de secours : chaque icône du
// combat doit y être (npm run fonts:subset régénère la police depuis lib/seal-glyphs.ts).
describe("kanji du combat", () => {
  it("chaque icône de tablette et d'issue est dans la police des sceaux, 奥 de l'ulti compris", () => {
    for (const glyph of [...Object.values(ACTION_KANJI), ...Object.values(OUTCOME_KANJI)]) expect(SEAL_GLYPHS).toContain(glyph);
    expect(ACTION_KANJI.ultimate).toBe("奥");
  });
});
