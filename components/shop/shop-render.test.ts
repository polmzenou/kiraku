import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import fr from "@/messages/fr.json";
import en from "@/messages/en.json";
import { buildShopView, purchaseKey, shopLotFrom, type ShopBoosterType, type ShopItemRow } from "@/lib/economy/shop-view";
import type { LotView } from "@/server/economy/lot-view";
import { CreditStrip, type CreditedBooster } from "../boosters/CreditStrip";
import { ShopShelves } from "./ShopShelves";

vi.mock("@/i18n/navigation", async () => {
  const { createElement: h } = await import("react");
  return { Link: (props: Record<string, unknown>) => h("a", props), useRouter: () => ({ refresh() {} }) };
});

const NOW = new Date("2026-10-14T12:00:00Z");
const TZ = "Europe/Paris";

const type = (slug: string, over: Partial<ShopBoosterType>): ShopBoosterType => ({
  id: `t-${slug}`,
  kind: "FILTERED",
  family: "genre",
  floors: ["COMMON", "COMMON", "UNCOMMON", "RARE"],
  poolSize: 1234,
  availability: "open",
  rotation: null,
  usesFreeStock: true,
  priceZeni: 200,
  ...over,
});

const lot = (id: string, slug: string, name: string, base: string): LotView => ({
  id,
  name,
  zeni: 0,
  lines: [
    {
      kind: "BOOSTER",
      quantity: 5,
      name,
      look: { slug, shape: "SACHET", theme: { base, dark: "#1b1b1b", pattern: "asanoha", ink: "light" }, emblem: "少", contents: "四枚入" },
    },
  ],
});

const item = (id: string, lotId: string, name: string): ShopItemRow => ({
  id,
  name,
  description: "Œuvres shōnen · 5 boosters à ouvrir quand tu veux.",
  lotId,
  priceZeni: 900,
  perUserLimit: 2,
  limitPeriod: "WEEKLY",
  endsAt: null,
});

function render(locale: "fr" | "en") {
  const lots = new Map<string, LotView>([
    ["l-shonen", lot("l-shonen", "shonen", "Shōnen", "#E0702E")],
    ["l-mecha", lot("l-mecha", "mecha", "Mecha", "#5A6068")],
  ]);
  const view = buildShopView<LotView>({
    items: [item("pack-5-shonen", "l-shonen", "Pack Shōnen ×5"), item("pack-5-mecha", "l-mecha", "Pack Mecha ×5")],
    lots: new Map([...lots].map(([id, l]) => [id, shopLotFrom(l)])),
    types: new Map([
      ["shonen", type("shonen", { family: "demographie", availability: "hidden", rotation: "resting" })],
      ["mecha", type("mecha", {})],
    ]),
    bought: new Map([[purchaseKey("pack-5-shonen", "2026-W42"), 2]]),
    credits: new Map([["t-mecha", 3]]),
    definitions: ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"].map((key, sortOrder) => ({ key, sortOrder })),
    now: NOW,
    timeZone: TZ,
  });
  const shelves = createElement(ShopShelves, {
    view,
    coins: 5000,
    now: NOW,
    dayEndsAt: new Date("2026-10-14T22:00:00Z"),
    renderBuy: (card) => createElement("button", { type: "button", "data-buy": card.id }, "buy"),
  });
  const providerProps = { locale, messages: locale === "fr" ? fr : en, timeZone: "UTC", onError: (e: Error) => { throw e; }, children: null };
  return renderToStaticMarkup(createElement(NextIntlClientProvider, providerProps, shelves));
}

describe("rendu de la boutique", () => {
  it.each(["fr", "en"] as const)("vedette, familles et cartes de packs en %s", (locale) => {
    const html = render(locale);
    expect(html).not.toContain("MISSING_MESSAGE");
    expect(html).not.toContain("NaN");
    expect(html).toContain("Pack Shōnen");
    expect(html).toContain(locale === "fr" ? "À l&#x27;affiche aujourd&#x27;hui" : "Featured today");
    expect(html).toContain('href="#famille-genre"');
    expect(html).toContain('id="famille-demographie"');
    expect(html).toMatch(/-10\s?%/u);
    expect(html).toMatch(/1[\s,]?000/u);
    expect(html).toContain(locale === "fr" ? "ni doré ni divin" : "no golden or divine pack");
    expect(html).toContain(locale === "fr" ? "Hors sélection du moment" : "Outside the current rotation");
    // Limite atteinte un mercredi : remise à zéro lundi à minuit, dans 4 jours et 10 heures
    expect(html).toContain(locale === "fr" ? "De nouveau disponible dans 5 jours" : "Available again in 5 days");
    expect(html).toContain('href="/ouvrir/mecha?credit=1"');
    // Un bouton d'achat par carte, plus celui de la vedette
    expect(html.match(/data-buy=/g)).toHaveLength(3);
  });
});

describe("boosters à ouvrir sur l'accueil", () => {
  const credit = (slug: string, name: string, count: number): CreditedBooster => ({
    slug,
    name,
    count,
    shape: "SACHET",
    theme: { base: "#2E4470", dark: "#0A1222", pattern: "yagasuri", ink: "light" },
    emblem: "侍",
    contents: "四枚入",
  });
  const strip = (locale: "fr" | "en", credits: CreditedBooster[]) => {
    const providerProps = { locale, messages: locale === "fr" ? fr : en, timeZone: "UTC", onError: (e: Error) => { throw e; }, children: null };
    return renderToStaticMarkup(createElement(NextIntlClientProvider, providerProps, createElement(CreditStrip, { credits })));
  };

  it.each(["fr", "en"] as const)("une ligne pour un type, un bandeau dès deux en %s", (locale) => {
    expect(strip(locale, [])).toBe("");
    const one = strip(locale, [credit("seinen", "Seinen", 3)]);
    expect(one).toContain(locale === "fr" ? "3 boosters Seinen à ouvrir" : "3 Seinen boosters to open");
    expect(one).not.toContain("data-swipe-ignore");

    const many = strip(locale, [credit("seinen", "Seinen", 3), credit("mecha", "Mecha", 1)]);
    expect(many).not.toContain("MISSING_MESSAGE");
    expect(many).toContain(locale === "fr" ? "Boosters à ouvrir" : "Boosters to open");
    expect(many).toContain("data-swipe-ignore");
    expect(many).toContain("×3");
    expect(many).toContain(locale === "fr" ? "Ouvrir 1 booster Mecha" : "Open 1 Mecha booster");
    expect(many).toContain('href="/ouvrir/mecha?credit=1"');
  });
});
