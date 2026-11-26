import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import fr from "@/messages/fr.json";
import type { BoosterPanelData } from "@/lib/boosters/panel";
import type { BoosterTypeView } from "@/lib/boosters/types";
import type { BoosterState } from "@/server/boosters/state";
import type { ShowcaseItem } from "./types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/i18n/navigation", async () => {
  const { createElement: h } = await import("react");
  return { Link: (props: Record<string, unknown>) => h("a", props) };
});
const { BoosterShowcase } = await import("./BoosterShowcase");

// Vitrine de l'accueil : un booster payant ne compte pas pour la pitié (seed : countsForPity faux), la vitrine ne
// doit pas lui dessiner d'anneau plein ; le jūbako annonce ses sachets d'après ses planchers.

const now = Date.parse("2026-11-26T12:00:00.000Z");
const state: BoosterState = { stock: 0, max: 10, nextAt: null, intervalMs: 3_600_000, serverNow: now, pityLeft: 30, pityThreshold: 50, goldenIn: null, coins: 5000 };
const odds = { COMMON: 1, UNCOMMON: 1, RARE: 1, EPIC: 0.2, LEGENDARY: 0.03, MYTHIC: 0.008 };

function boosterType(over: Partial<BoosterTypeView>): BoosterTypeView {
  return {
    id: "t-shonen",
    slug: "shonen",
    kind: "FILTERED",
    family: "demographie",
    sortOrder: 0,
    name: { fr: "Shōnen", en: "Shōnen" },
    tagline: { fr: "Combats", en: "Fights" },
    emblem: "少",
    shape: "SACHET",
    theme: { base: "#C8372D", dark: "#5E1712", pattern: "asanoha", ink: "light" },
    filter: null,
    slotFloors: [],
    usesFreeStock: false,
    priceZeni: 300,
    countsForPity: false,
    resetsPity: false,
    bonusEligible: false,
    rateBoost: 10_000,
    rateBoostFrom: null,
    guaranteed: null,
    featuredCardIds: [],
    featuredRate: 0,
    featuredPity: 0,
    focusSeriesIds: [],
    focusCardIds: [],
    includeCustom: true,
    minPoolSize: null,
    startsAt: null,
    endsAt: null,
    active: true,
    activatedAt: null,
    ...over,
  };
}

function panel(over: Partial<BoosterPanelData>): BoosterPanelData {
  return {
    slotFloors: ["COMMON", "COMMON", "UNCOMMON", "RARE"],
    packs: null,
    best: "RARE",
    odds,
    inPool: ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"],
    poolSize: 240,
    pityLeft: null,
    pityKept: false,
    goldenIn: null,
    featured: null,
    duplicateGuard: null,
    price: { kind: "zeni", amount: 300 },
    availability: "open",
    ...over,
  };
}

const provider = { locale: "fr" as const, messages: fr, timeZone: "Europe/Paris", children: null };

function render(type: BoosterTypeView, data: BoosterPanelData) {
  const item: ShowcaseItem = { type, cards: data.slotFloors.length, selectable: true, panel: data, wishlist: null };
  const family = { family: type.family, kanji: "層", title: "Démographie", short: "Démo", subtitle: "", rotating: false };
  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      provider,
      createElement(BoosterShowcase, {
        items: [item],
        families: [family],
        initial: { slug: type.slug, family: type.family },
        state,
        ctx: { year: 2026, month: 11, day: 26, season: "FALL", seasonYear: 2026 },
        rotationNote: "",
        banner: null,
        focus: null,
        heading: createElement("h1", null, "Boosters"),
      }),
    ),
  );
}

// Arc de l'anneau : seul cercle tracé à l'encre du hero
const ARC = 'stroke="var(--ink)"';

describe("vitrine des boosters", () => {
  it("booster payant hors pitié : « hors pitié partagée », ni anneau ni arc", () => {
    const html = render(boosterType({}), panel({ pityLeft: null }));
    expect(html).toContain("hors pitié partagée");
    expect(html).not.toContain(ARC);
    expect(html).not.toContain('stroke="var(--track)"');
  });

  it("booster qui compte pour la pitié : l'anneau montre la part parcourue", () => {
    const html = render(boosterType({ slug: "standard", countsForPity: true }), panel({ pityLeft: 30 }));
    expect(html).toContain("avant Mythique sûre");
    expect(html).toContain('stroke="var(--track)"');
    // 20 boosters comptés sur 50 : 40 % du cercle (119,4)
    expect(html).toContain('stroke-dasharray="47.8 119.4"');
  });

  it("anneau vide, sans arc, quand aucun booster n'est encore compté", () => {
    const html = render(boosterType({ slug: "standard", countsForPity: true }), panel({ pityLeft: 50 }));
    expect(html).toContain('stroke="var(--track)"');
    expect(html).not.toContain(ARC);
  });

  it("jūbako : le nombre de sachets vient des planchers, pas d'un 5 écrit en dur", () => {
    const floors = Array.from({ length: 12 }, () => "COMMON");
    const html = render(boosterType({ slug: "boite", shape: "JUBAKO" }), panel({ slotFloors: floors, packs: 3 }));
    expect(html).toContain("cartes, en 3 sachets");
    expect(html).not.toContain("5 sachets");
  });

  it("lignes de chances du hero et de la bande mobile, phrases complètes pour les lecteurs d'écran", () => {
    const html = render(boosterType({}), panel({}));
    expect(html).toMatch(/Épique ou mieux : 20\s%/u);
    // Bande mobile et panneau des taux : nom à la couleur de la rareté, lisible sous Washi (jeton rarity-label-*)
    expect(html).toContain("text-rarity-label-epic");
  });
});
