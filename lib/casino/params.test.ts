import { describe, expect, it } from "vitest";
import { parseSalonParams, salonHref } from "./params";

const TIERS = ["COMMON", "RARE", "MYTHIC", "AR"];

describe("paramètres du salon", () => {
  it("par défaut : onglet des tables, tous les paliers", () => {
    expect(parseSalonParams({}, TIERS)).toEqual({ tab: "tables", tier: null, reserveFor: null, rematchOf: null });
  });

  it("garde un onglet et un palier connus", () => {
    expect(parseSalonParams({ onglet: "historique", palier: "MYTHIC" }, TIERS)).toMatchObject({ tab: "historique", tier: "MYTHIC" });
  });

  it("ignore un onglet ou un palier inconnus", () => {
    expect(parseSalonParams({ onglet: "autre", palier: "BR" }, TIERS)).toMatchObject({ tab: "tables", tier: null });
  });

  it("réservation et revanche : formats contrôlés", () => {
    expect(parseSalonParams({ pour: "kenji_77" }, TIERS).reserveFor).toBe("kenji_77");
    expect(parseSalonParams({ pour: "<script>" }, TIERS).reserveFor).toBeNull();
    expect(parseSalonParams({ revanche: "cmi3k9x2f0007p4sh2ka7rq1" }, TIERS).rematchOf).toBe("cmi3k9x2f0007p4sh2ka7rq1");
    expect(parseSalonParams({ revanche: "../x" }, TIERS).rematchOf).toBeNull();
  });

  it("prend la première valeur d'un paramètre répété", () => {
    expect(parseSalonParams({ onglet: ["mes-tables", "historique"] }, TIERS).tab).toBe("mes-tables");
  });

  it("construit les liens sans paramètres vides", () => {
    expect(salonHref({})).toBe("/casino/pile-ou-face");
    expect(salonHref({ tab: "tables", tier: "RARE" })).toBe("/casino/pile-ou-face?palier=RARE");
    expect(salonHref({ tab: "historique" })).toBe("/casino/pile-ou-face?onglet=historique");
  });
});
