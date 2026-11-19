import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import fr from "@/messages/fr.json";
import en from "@/messages/en.json";
import type { WrappedSummary } from "@/lib/wrapped/summary";
import { WRAPPED_SETTING_KEYS, type WrappedSettings } from "@/lib/settings/wrapped-form";
import { SETTING_DEFAULTS } from "@/lib/settings/defaults";
import { WrappedSettingsForm } from "@/components/admin/WrappedSettingsForm";
import { WrappedBanner } from "@/components/home/WrappedBanner";
import { WrappedStory } from "./WrappedStory";

vi.mock("@/server/actions/admin-settings", () => ({ updateWrappedSettings: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/i18n/navigation", async () => {
  const { createElement: h } = await import("react");
  return { Link: (props: Record<string, unknown>) => h("a", props), useRouter: () => ({ refresh() {} }) };
});

function render(locale: "fr" | "en", element: ReactElement) {
  const providerProps = { locale, messages: locale === "fr" ? fr : en, timeZone: "UTC", onError: (e: Error) => { throw e; }, children: null };
  return renderToStaticMarkup(createElement(NextIntlClientProvider, providerProps, element));
}

const card = { cardId: "c1", anilistId: 7, name: "Makima", rarity: "MYTHIC", imageUrl: "https://s4.anilist.co/x.jpg", spoiler: false, gold: false, frame: "#d4a9c8" };
const full: WrappedSummary = {
  year: 2026,
  username: "akira",
  boosters: { opened: 312, golden: 4, divine: 1, zeniSpent: 2400 },
  bestPull: { ...card, at: "2026-06-01T10:00:00.000Z" },
  pulledByRarity: { COMMON: 900, EPIC: 50, MYTHIC: 3 },
  discoveries: 410,
  zeni: { earned: 48_200, spent: 12_000, topSource: "SALE" },
  battles: { played: 88, won: 51 },
  ranked: { played: 40, won: 22, bestPc: 1540, tier: "GOLD", division: 2 },
  favorite: { ...card, cardId: "c2", name: "Denji", rarity: "EPIC", source: "battle", battles: 37 },
};
const quiet: WrappedSummary = { ...full, bestPull: null, favorite: null, battles: { played: 0, won: 0 }, ranked: null, zeni: { earned: 0, spent: 0, topSource: null }, discoveries: 0 };

const story = (summary: WrappedSummary, embedded = false) =>
  createElement(WrappedStory, { summary, cards: { bestPull: null, favorite: null }, imageSrc: "/wrapped/image", siteUrl: "https://kiraku-kun.com", embedded });

describe("diaporama du Wrapped", () => {
  it.each(["fr", "en"] as const)("se rend complet sans message manquant ni valeur invalide (%s)", (locale) => {
    for (const summary of [full, quiet]) {
      const html = render(locale, story(summary));
      expect(html).not.toMatch(/MISSING_MESSAGE|NaN|undefined|\{year\}/);
    }
  });

  it("raconte l'année : boosters, plus gros tirage, Zeni, combats, rang et carte préférée", () => {
    // Rendu serveur : tous les écrans à la suite (lisibles sans JavaScript)
    const html = render("fr", story(full));
    expect(html).toContain("2026, ton année sur Kiraku");
    expect(html).toContain("312 boosters ouverts");
    expect(html).toContain("dont 4 dorés et 1 divin");
    expect(html).toContain("Makima");
    expect(html).toMatch(/48\s?200 Zeni gagnés/);
    expect(html).toContain("51 victoires");
    expect(html).toContain("58 % de victoires");
    expect(html).toContain("Meilleur rang en classé : Or II");
    expect(html).toContain("Alignée dans 37 combats");
    expect(html).toContain("Partager l&#x27;image");
  });

  it("garde une année sans combat ni tirage notable lisible", () => {
    const html = render("fr", story(quiet));
    expect(html).toContain("Pas encore de combat cette année");
    expect(html).not.toContain("Plus gros tirage");
    expect(html).not.toContain("Carte préférée");
  });
});

describe("annonces et admin du Wrapped", () => {
  it.each(["fr", "en"] as const)("bannière et formulaire se rendent (%s)", (locale) => {
    const initial = Object.fromEntries(WRAPPED_SETTING_KEYS.map((k) => [k, SETTING_DEFAULTS[k]])) as WrappedSettings;
    for (const el of [createElement(WrappedBanner, { year: 2026 }), createElement(WrappedSettingsForm, { initial })]) {
      expect(render(locale, el)).not.toMatch(/MISSING_MESSAGE|NaN/);
    }
  });

  it("est livré éteint", () => {
    expect(SETTING_DEFAULTS["wrapped.enabled"]).toBe(false);
    expect(Date.parse(SETTING_DEFAULTS["wrapped.opensAt"])).toBeLessThan(Date.parse(SETTING_DEFAULTS["wrapped.closesAt"]));
  });
});
