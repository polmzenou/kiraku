import { describe, expect, it } from "vitest";
import {
  isTermsGateFree,
  needsTermsAcceptance,
  pickLegalDocument,
  publishedVersions,
  safeLegalUrl,
  stripLocale,
  type LegalRow,
} from "./legal";

const at = new Date("2026-10-01T00:00:00Z");
const row = (o: Partial<LegalRow>): LegalRow => ({
  locale: "fr",
  version: 1,
  title: "CGU",
  body: "Texte",
  status: "PUBLISHED",
  publishedAt: at,
  ...o,
});

describe("pages légales versionnées", () => {
  it("prend la plus haute version publiée, jamais un brouillon", () => {
    const rows = [row({ version: 1 }), row({ version: 2 }), row({ version: 3, status: "DRAFT", publishedAt: null })];
    expect(publishedVersions(rows)).toEqual([2, 1]);
    expect(pickLegalDocument(rows, "fr")?.version).toBe(2);
  });

  it("sert une ancienne version publiée sur demande, sinon la version en vigueur", () => {
    const rows = [row({ version: 1, body: "v1" }), row({ version: 2, body: "v2" }), row({ version: 3, status: "DRAFT", body: "brouillon" })];
    expect(pickLegalDocument(rows, "fr", 1)?.body).toBe("v1");
    expect(pickLegalDocument(rows, "fr", 3)?.body).toBe("v2");
    expect(pickLegalDocument(rows, "fr", 99)?.version).toBe(2);
  });

  it("retombe sur le français quand l'anglais manque ou est vide", () => {
    const rows = [row({ version: 1, locale: "fr", body: "Bonjour" }), row({ version: 1, locale: "en", body: "  " })];
    const doc = pickLegalDocument(rows, "en");
    expect(doc).toMatchObject({ locale: "fr", body: "Bonjour", fallback: true });
    const withEn = [...rows.slice(0, 1), row({ version: 1, locale: "en", body: "Hello" })];
    expect(pickLegalDocument(withEn, "en")).toMatchObject({ locale: "en", fallback: false });
  });

  it("rien de publié : null", () => {
    expect(pickLegalDocument([row({ status: "DRAFT", publishedAt: null })], "fr")).toBeNull();
    expect(pickLegalDocument([], "fr")).toBeNull();
  });
});

describe("acceptation des CGU", () => {
  it("un invité n'est jamais bloqué", () => {
    expect(needsTermsAcceptance({ isGuest: true, termsVersion: null }, 3)).toBe(false);
  });

  it("un compte inscrit accepte la version exigée", () => {
    expect(needsTermsAcceptance({ isGuest: false, termsVersion: null }, 1)).toBe(true);
    expect(needsTermsAcceptance({ isGuest: false, termsVersion: 1 }, 2)).toBe(true);
    expect(needsTermsAcceptance({ isGuest: false, termsVersion: 2 }, 2)).toBe(false);
  });

  it("laisse lire les pages légales et se connecter", () => {
    expect(stripLocale("/en/cgu")).toBe("/cgu");
    expect(stripLocale("/en")).toBe("/");
    expect(stripLocale("/entrepot")).toBe("/entrepot");
    expect(isTermsGateFree("/cgu")).toBe(true);
    expect(isTermsGateFree("/en/confidentialite")).toBe(true);
    expect(isTermsGateFree("/connexion/mot-de-passe-oublie")).toBe(true);
    expect(isTermsGateFree("/")).toBe(false);
    expect(isTermsGateFree("/cguxyz")).toBe(false);
    expect(isTermsGateFree("/marche")).toBe(false);
  });
});

describe("liens des textes légaux", () => {
  it("garde https, mailto, ancres et chemins internes", () => {
    expect(safeLegalUrl("https://www.cnil.fr/")).toBe("https://www.cnil.fr/");
    expect(safeLegalUrl("mailto:contact@kiraku.app")).toBe("mailto:contact@kiraku.app");
    expect(safeLegalUrl("/cookies")).toBe("/cookies");
    expect(safeLegalUrl("#droits")).toBe("#droits");
  });

  it("refuse javascript:, data:, http et les hôtes relatifs au protocole", () => {
    expect(safeLegalUrl("javascript:alert(1)")).toBe("");
    expect(safeLegalUrl(" JaVaScRiPt:alert(1)")).toBe("");
    expect(safeLegalUrl("data:text/html,<script>")).toBe("");
    expect(safeLegalUrl("http://exemple.com")).toBe("");
    expect(safeLegalUrl("//evil.example")).toBe("");
    expect(safeLegalUrl("/\\evil.example")).toBe("");
  });
});
