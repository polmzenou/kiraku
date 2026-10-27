import { describe, expect, it } from "vitest";
import { canDeleteCatalogCard, canEditCatalogCard, catalogScope, isStaff } from "./roles";

describe("rôles de l'équipe", () => {
  it("reconnaît l'équipe et son périmètre catalogue", () => {
    expect(isStaff("ADMIN")).toBe(true);
    expect(isStaff("DEV")).toBe(true);
    expect(isStaff("USER")).toBe(false);
    expect(isStaff(undefined)).toBe(false);
    expect(catalogScope("ADMIN")).toBe("full");
    expect(catalogScope("DEV")).toBe("drafts");
    expect(catalogScope("USER")).toBeNull();
  });

  it("laisse l'admin tout modifier", () => {
    expect(canEditCatalogCard("full", { status: "PUBLISHED", copies: 12 }, "PUBLISHED")).toBe(true);
    expect(canEditCatalogCard("full", null, "PUBLISHED")).toBe(true);
    expect(canDeleteCatalogCard("full", "ARCHIVED")).toBe(true);
  });

  it("limite le DEV aux brouillons qui n'ont touché aucun joueur", () => {
    expect(canEditCatalogCard("drafts", null, "DRAFT")).toBe(true);
    expect(canEditCatalogCard("drafts", { status: "DRAFT", copies: 0 }, "DRAFT")).toBe(true);
    // Publier, même à la création
    expect(canEditCatalogCard("drafts", null, "PUBLISHED")).toBe(false);
    expect(canEditCatalogCard("drafts", { status: "DRAFT", copies: 0 }, "PUBLISHED")).toBe(false);
    expect(canEditCatalogCard("drafts", null, "ARCHIVED")).toBe(false);
    // Carte publiée ou archivée : lecture seule
    expect(canEditCatalogCard("drafts", { status: "PUBLISHED", copies: 0 }, "DRAFT")).toBe(false);
    expect(canEditCatalogCard("drafts", { status: "ARCHIVED", copies: 0 }, "DRAFT")).toBe(false);
    // Brouillon déjà possédé (carte restaurée après publication)
    expect(canEditCatalogCard("drafts", { status: "DRAFT", copies: 1 }, "DRAFT")).toBe(false);
  });

  it("ne laisse le DEV supprimer qu'un brouillon", () => {
    expect(canDeleteCatalogCard("drafts", "DRAFT")).toBe(true);
    expect(canDeleteCatalogCard("drafts", "ARCHIVED")).toBe(false);
    expect(canDeleteCatalogCard("drafts", "PUBLISHED")).toBe(false);
  });
});
