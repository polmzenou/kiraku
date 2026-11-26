import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import fr from "@/messages/fr.json";
import en from "@/messages/en.json";
import { TRAIL_STATIONS, trailPointAt } from "@/lib/expedition/trail";
import type { ActiveExpeditionView } from "@/lib/expedition/view";
import { ExpeditionEmaki } from "./ExpeditionEmaki";

vi.mock("@/server/actions/expedition", () => ({ abandonExpeditionAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const START = Date.UTC(2026, 10, 17, 8);
const DURATION = 2 * 3_600_000;
const reward = { zeni: 100, boosters: 1, extraLot: false };

const active: ActiveExpeditionView = {
  id: "exp",
  name: "Sentier des lucioles",
  minRarity: "EPIC",
  risk: "SAFE",
  startedAt: new Date(START).toISOString(),
  endsAt: new Date(START + DURATION).toISOString(),
  successPct: 80,
  triumphPct: 10,
  rewards: { FAILURE: { zeni: 10, boosters: 0, extraLot: false }, SUCCESS: reward, TRIUMPH: { ...reward, boosters: 2 } },
  boosterName: "Standard",
  extraLot: null,
  team: [],
};

function render(locale: "fr" | "en", progress: number) {
  const providerProps = { locale, messages: locale === "fr" ? fr : en, timeZone: "UTC", onError: (e: Error) => { throw e; }, children: null };
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, providerProps, createElement(ExpeditionEmaki, { active, serverNow: START + progress * DURATION, cooldownHours: 2, reduced: false })),
  );
}

describe("rouleau d'une expédition en route", () => {
  it.each(["fr", "en"] as const)("pose le paysage, le chemin et la lanterne en %s", (locale) => {
    const html = render(locale, 0.5);
    // Servies telles quelles en production (images.unoptimized) ; le test voit l'URL de l'optimiseur
    expect(html).toMatch(/src="[^"]*emaki-dawn-v1\.webp/);
    expect(html).toMatch(/src="[^"]*emaki-dusk-v1\.webp/);
    expect(html).toContain("Sentier des lucioles");
    expect(html).not.toContain("MISSING_MESSAGE");
    expect(html).not.toContain("NaN");
    // Les deux heures du paysage : le crépuscule à mi-chemin est à moitié fondu
    expect(html).toContain("opacity:0.5");
    // Position de la lanterne sur l'image
    const here = trailPointAt(0.5);
    expect(html).toContain(`--lx:${here.x / 2048}`);
    expect(html).toContain(`--ly:${here.y / 768}`);
  });

  it("allume les relais déjà atteints", () => {
    for (const progress of [0, 0.5, 1]) {
      const html = render("fr", progress);
      const stations = html.match(/<span aria-hidden="true" lang="ja" class="[^"]*"[^>]*>宿<\/span>/g) ?? [];
      expect(stations).toHaveLength(TRAIL_STATIONS.length);
      const lit = stations.filter((s) => s.includes("bg-kin text-sumi")).length;
      expect(lit).toBe(TRAIL_STATIONS.filter((s) => progress >= s.at).length);
    }
  });
});
