import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LEGAL_LOCALES, LEGAL_SLUGS } from "@/lib/legal/legal";
import { splitTitle } from "./legal";

describe("textes légaux de départ", () => {
  it("sépare le titre du corps", () => {
    expect(splitTitle("# CGU\r\n\r\n## 1. Objet\r\nTexte")).toEqual({ title: "CGU", body: "## 1. Objet\nTexte" });
    expect(splitTitle("Sans titre")).toEqual({ title: "", body: "Sans titre" });
  });

  it("chaque page existe en français et en anglais, avec un titre et sans HTML brut", () => {
    for (const slug of LEGAL_SLUGS) {
      for (const locale of LEGAL_LOCALES) {
        const raw = readFileSync(path.join(import.meta.dirname, "legal", `${slug}.${locale}.md`), "utf8");
        const { title, body } = splitTitle(raw);
        expect(title.length, `${slug}.${locale}`).toBeGreaterThan(3);
        expect(body.length, `${slug}.${locale}`).toBeGreaterThan(200);
        expect(body, `${slug}.${locale}`).not.toMatch(/<[a-z/!]/i);
      }
    }
  });
});
