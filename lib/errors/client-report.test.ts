import { describe, expect, it } from "vitest";
import { clientErrorReport, clientErrorSchema, logLine } from "./client-report";

describe("rapport d'une erreur du navigateur", () => {
  it("garde le nom, le message, la référence et le début de la pile", () => {
    const error = Object.assign(new TypeError("x is undefined"), { digest: "123456" });
    const report = clientErrorReport(error, "/expedition", "page");
    expect(report).toMatchObject({ boundary: "page", name: "TypeError", message: "x is undefined", digest: "123456", path: "/expedition" });
    expect(report.stack).toContain("TypeError");
    expect(clientErrorSchema.safeParse(report).success).toBe(true);
  });

  it("coupe ce qui dépasse, pour rester valide", () => {
    const error = { name: "N".repeat(500), message: "m".repeat(10_000), stack: "s".repeat(20_000) };
    const report = clientErrorReport(error, `/${"p".repeat(1_000)}`, "global");
    expect(clientErrorSchema.safeParse(report).success).toBe(true);
    expect(report.message).toHaveLength(1_000);
  });

  it("accepte une valeur qui n'est pas une Error", () => {
    expect(clientErrorReport("chaîne lancée", "/", "page")).toMatchObject({ name: "Error", message: "chaîne lancée" });
    expect(clientErrorReport(null, "/", "page")).toMatchObject({ name: "Error", message: "" });
  });

  it("ligne des logs : ni retour à la ligne, ni contrôle C0 ou C1, ni séparateur Unicode", () => {
    const c = (code: number) => String.fromCharCode(code);
    // Saut de ligne, échappement ANSI (ESC [), CSI C1 (U+009B), NEL (U+0085), séparateurs de ligne et de paragraphe
    const forged = `a\nb\r${c(0x1b)}[31mc${c(0x9b)}2Jd${c(0x85)}e${c(0x2028)}f${c(0x2029)}g${c(0x7f)}h`;
    expect(logLine(forged)).toBe("a b [31mc 2Jd e f g h");
    // Le texte ordinaire, accents et kanji compris, passe tel quel
    expect(logLine("Fuda 稀 · été")).toBe("Fuda 稀 · été");
  });

  it("refuse un champ en trop", () => {
    expect(clientErrorSchema.safeParse({ ...clientErrorReport(new Error("e"), "/", "page"), email: "a@b.c" }).success).toBe(false);
  });
});
