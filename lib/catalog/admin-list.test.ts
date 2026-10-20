import { describe, expect, it } from "vitest";
import { adminCatalogHref, parseAdminCatalogParams } from "./admin-list";

describe("paramètres de la liste du catalogue admin", () => {
  it("applique les valeurs par défaut et ignore les valeurs invalides", () => {
    expect(parseAdminCatalogParams({})).toEqual({ q: "", rarity: "", series: "", status: "", origin: "", kind: "", sort: "updated", page: 1 });
    expect(parseAdminCatalogParams({ sort: "drop table", status: "DELETED", rarity: "x y", page: "-3", kind: "all" }))
      .toMatchObject({ sort: "updated", status: "", rarity: "", page: 1, kind: "" });
  });
  it("lit tri, variantes et page", () => {
    expect(parseAdminCatalogParams({ sort: "rarity", kind: "variants", rarity: "AR", page: "3", q: ["a", "b"] }))
      .toMatchObject({ sort: "rarity", kind: "variants", rarity: "AR", page: 3, q: "" });
  });
  it("construit une URL minimale et revient en page 1 quand un filtre change", () => {
    const params = parseAdminCatalogParams({ page: "4", sort: "name" });
    expect(adminCatalogHref(params)).toBe("/admin/catalogue?sort=name");
    expect(adminCatalogHref(params, { page: 5 })).toBe("/admin/catalogue?sort=name&page=5");
    expect(adminCatalogHref(params, { status: "DRAFT" })).toBe("/admin/catalogue?status=DRAFT&sort=name");
  });
});
