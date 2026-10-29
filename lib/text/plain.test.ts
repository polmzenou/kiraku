import { describe, expect, it } from "vitest";
import { noteSchema } from "./note-schema";
import { cleanPlainText, NOTE_MAX_LENGTH } from "./plain";

describe("texte brut", () => {
  it("retire contrôles et marques d'orientation, garde deux sauts de ligne au plus", () => {
    expect(cleanPlainText("  Salut\u202e\u0000 !\r\n\n\n\nÀ plus  ")).toBe("Salut !\n\nÀ plus");
  });
});

describe("commentaire facultatif", () => {
  it("vaut null s'il est absent ou vide", () => {
    expect(noteSchema.parse(undefined)).toBeNull();
    expect(noteSchema.parse("   \u200b ")).toBeNull();
  });

  it("garde le texte nettoyé", () => {
    expect(noteSchema.parse(" Je préfère la carte 1 ")).toBe("Je préfère la carte 1");
  });

  it("refuse au-delà de 200 caractères (après nettoyage)", () => {
    expect(noteSchema.safeParse("a".repeat(NOTE_MAX_LENGTH)).success).toBe(true);
    expect(noteSchema.safeParse("a".repeat(NOTE_MAX_LENGTH + 1)).success).toBe(false);
    expect(noteSchema.safeParse(` ${"a".repeat(NOTE_MAX_LENGTH)} `).success).toBe(true);
  });
});
