import { describe, expect, it } from "vitest";
import en from "./en.json";
import fr from "./fr.json";

function keys(obj: object, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe("messages", () => {
  it("fr et en ont exactement les mêmes clés", () => {
    expect(keys(en).sort()).toEqual(keys(fr).sort());
  });

  it("aucune traduction vide", () => {
    for (const messages of [fr, en]) {
      const empty = keys(messages).filter((k) => {
        const value = k.split(".").reduce<unknown>((o, part) => (o as Record<string, unknown>)[part], messages);
        return typeof value !== "string" || value.trim() === "";
      });
      expect(empty).toEqual([]);
    }
  });
});
