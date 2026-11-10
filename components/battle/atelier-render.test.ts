import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import fr from "@/messages/fr.json";
import en from "@/messages/en.json";
import { abilityRules, DEFAULT_BATTLE_RULES } from "@/lib/battle/config";
import type { WorkshopCard } from "@/lib/battle/view";
import { AbilityWorkshop } from "./AbilityWorkshop";
import { WorkshopBrowser } from "./WorkshopBrowser";

vi.mock("@/i18n/navigation", async () => {
  const { createElement: h } = await import("react");
  return {
    Link: ({ href, ...props }: { href: string } & Record<string, unknown>) => h("a", { href, ...props }),
    useRouter: () => ({ push: () => {}, refresh: () => {} }),
  };
});
vi.mock("@/server/actions/battle", () => ({ buyAbilityAction: vi.fn(), equipAbilitiesAction: vi.fn() }));
// La face de la carte a ses propres tests
vi.mock("@/components/fuda/Fuda", () => ({ Fuda: () => null }));

const MESSAGES = { fr, en };
const rules = { ...abilityRules(DEFAULT_BATTLE_RULES), synergyAtkPct: 10, abilityPrices: DEFAULT_BATTLE_RULES.abilityPrices };

const providerProps = (locale: "fr" | "en") => ({
  locale,
  messages: MESSAGES[locale],
  timeZone: "UTC",
  // Une clé manquante fait échouer le test
  onError: (e: Error) => {
    throw e;
  },
  children: null,
});

function render(locale: "fr" | "en", node: ReactElement) {
  return renderToStaticMarkup(createElement(NextIntlClientProvider, providerProps(locale), node));
}

// renderToStaticMarkup échappe les apostrophes ; next-intl formate les nombres avec une espace insécable étroite
const html = (text: string) => text.replace(/'/g, "&#x27;");
const plain = (markup: string) => markup.replace(/[  ]/g, " ");

const card = (over: Partial<WorkshopCard> = {}): WorkshopCard => ({
  cardId: "c1",
  anilistId: 1,
  name: "Gojo Satoru",
  nameNative: null,
  imageUrl: "/x.webp",
  rank: 1,
  rarity: "LEGENDARY",
  power: 80,
  ki: 70,
  hp: 192,
  spoiler: false,
  universe: { key: "u-jjk", name: "Jujutsu Kaisen" },
  keywords: ["FLURRY", "POISON"],
  technique: "ISSEN",
  ultimate: null,
  slots: 2,
  base: { keywords: ["BARRIER", "POISON"], technique: "ISSEN" },
  owned: { keywords: ["BARRIER", "FLURRY", "POISON"], techniques: ["ISSEN"] },
  ...over,
});

// Commune : aucun emplacement de passif, la technique est sélectionnée d'entrée
const common = card({
  cardId: "c2",
  name: "Nobara Kugisaki",
  rarity: "COMMON",
  keywords: [],
  technique: "FUIN",
  slots: 0,
  base: { keywords: [], technique: "FUIN" },
  owned: { keywords: [], techniques: ["FUIN", "KONSHIN"] },
});

describe("atelier d'une carte", () => {
  it("montre les emplacements actuels et le retour au kit d'origine d'une carte modifiée", () => {
    const out = render("fr", createElement(AbilityWorkshop, { card: card(), coins: 5_000, rules, onClose: () => {} }));
    expect(out).toContain("Emplacements");
    expect(out).toContain("Passif 1");
    expect(out).toContain("Passif 2");
    expect(out).toContain("Rafale");
    expect(out).toContain("Poison");
    expect(out).toContain("Technique");
    expect(out).toContain("Éclair");
    expect(out).toContain(html("Revenir au kit d'origine"));
    expect(plain(out)).toContain("Solde : 5 000 Zeni");
    expect(out).toContain(html("Touche un emplacement pour voir par quoi le remplacer."));
  });

  it("une carte au kit d'origine n'a pas de bouton de retour", () => {
    const out = render("fr", createElement(AbilityWorkshop, { card: card({ keywords: ["BARRIER", "POISON"] }), coins: 0, rules, onClose: () => {} }));
    expect(out).not.toContain(html("Revenir au kit d'origine"));
  });

  it("Commune : aucun passif, la technique propose ses remplaçants acquis puis à acheter, prix compris", () => {
    const out = plain(render("fr", createElement(AbilityWorkshop, { card: common, coins: 100, rules, onClose: () => {} })));
    expect(out).toContain(html("Cette rareté n'a aucun emplacement de passif : seule la technique se change."));
    expect(out).toContain("Remplacer Sceau");
    expect(out).toContain("Acquis : gratuit");
    expect(out).toContain("Coup absolu");
    expect(out).toContain("Achetée");
    expect(out).toContain(html("Équiper Coup absolu"));
    expect(out).toContain("À acheter");
    expect(out).toContain(html(`Acheter Éclair pour 750 Zeni`));
    // Aucune ligne pour la technique déjà équipée
    expect(out).not.toContain("Acheter Sceau");
    expect(out).not.toContain("Passif 1");
  });

  it("l'ulti s'affiche en lecture seule : ni bouton, ni prix", () => {
    for (const locale of ["fr", "en"] as const) {
      const gold = card({ rarity: "GOLD", ultimate: "TOKIDOME" });
      const out = plain(render(locale, createElement(AbilityWorkshop, { card: gold, coins: 99_999, rules, onClose: () => {} })));
      const ult = MESSAGES[locale].battle.ultimates.TOKIDOME;
      expect(out).toContain(ult.name);
      expect(out).toContain(html(ult.desc));
      expect(out).toContain(html(MESSAGES[locale].battle.atelier.ultimateLocked));
      // Aucun moyen de l'acheter ou de l'équiper
      expect(out).not.toMatch(new RegExp(`(Acheter|Équiper|Buy|Equip) ${ult.name}`));
      expect(plain(render(locale, createElement(AbilityWorkshop, { card: card(), coins: 0, rules, onClose: () => {} })))).not.toContain(ult.name);
    }
  });

  it("en anglais", () => {
    const out = plain(render("en", createElement(AbilityWorkshop, { card: common, coins: 100, rules, onClose: () => {} })));
    expect(out).toContain("Slots");
    expect(out).toContain("This rarity has no passive slot: only the technique can change.");
    expect(out).toContain("Replace Seal");
    expect(out).toContain("Owned: free");
    expect(out).toContain("To buy");
    expect(out).toContain("Balance: 100 Zeni");
    const legendary = render("en", createElement(AbilityWorkshop, { card: card(), coins: 0, rules, onClose: () => {} }));
    expect(legendary).toContain("Passive 1");
    expect(legendary).toContain("Back to the original kit");
  });
});

describe("page de l'atelier", () => {
  it("grille des cartes avec filtres, carte modifiée signalée", () => {
    for (const locale of ["fr", "en"] as const) {
      const out = render(locale, createElement(WorkshopBrowser, { cards: [card(), common], coins: 0, rules, initialCardId: null }));
      expect(out).toContain(locale === "fr" ? html("Ouvrir l'atelier de Gojo Satoru") : html("Open Gojo Satoru's workshop"));
      expect(out).toContain(locale === "fr" ? "Modifiée" : "Modified");
      // Pas de filtre « même univers » : il n'a de sens que pour composer une équipe
      expect(out).not.toContain(locale === "fr" ? "Même univers" : "Same universe");
      expect(out.match(locale === "fr" ? /Modifiée/g : /Modified/g)).toHaveLength(1);
    }
  });

  it("?carte= ouvre directement l'atelier de la carte", () => {
    const out = render("fr", createElement(WorkshopBrowser, { cards: [card(), common], coins: 0, rules, initialCardId: "c2" }));
    expect(out).toContain("Remplacer Sceau");
  });

  it("sans carte : un message", () => {
    expect(render("fr", createElement(WorkshopBrowser, { cards: [], coins: 0, rules, initialCardId: null }))).toContain("Aucune carte pour");
  });
});
