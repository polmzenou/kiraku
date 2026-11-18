import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import fr from "@/messages/fr.json";
import { BASE_DEFINITIONS } from "@/lib/catalog/definitions";
import type { CoinFlipTableView } from "@/server/casino/queries";

vi.mock("@/server/actions/casino", () => ({ coinFlipLobbyAction: vi.fn(), declineCoinFlipAction: vi.fn(), createCoinFlipAction: vi.fn() }));
vi.mock("@/server/actions/collection", () => ({ loadCollectionPage: vi.fn(() => new Promise(() => {})) }));
vi.mock("@/components/fuda/Fuda", async () => {
  const { createElement: h } = await import("react");
  return { Fuda: ({ card }: { card: { name: string } }) => h("span", { "data-card": card.name }) };
});
vi.mock("@/components/realtime/usePoll", () => ({ usePoll: () => ({ pollNow() {} }) }));
vi.mock("@/lib/catalog/use-rarities", () => ({ useRaritySeals: () => ({ MYTHIC: "神", BR: "闇", RARE: "稀" }), useRarities: () => ["RARE", "MYTHIC", "BR"] }));
vi.mock("@/i18n/navigation", async () => {
  const { createElement: h } = await import("react");
  return { Link: ({ prefetch, ...props }: Record<string, unknown>) => (void prefetch, h("a", props)), useRouter: () => ({ refresh() {}, push() {} }) };
});
const { CoinFlipSalon } = await import("./CoinFlipSalon");
// Comme i18n/request.ts : les noms du registre complètent l'espace « rarity » (variantes comprises)
const messages = { ...fr, rarity: { ...fr.rarity, ...Object.fromEntries(BASE_DEFINITIONS.map((r) => [r.key, r.nameFr])) } };
const providerProps = { locale: "fr" as const, messages, timeZone: "Europe/Paris", children: null };

const NOW = Date.parse("2026-12-05T12:00:00.000Z");
const player = (username: string) => ({ id: username, username, image: null, isGuest: false, decor: { frame: null, nameColor: null } });
const card = (name: string, rarity = "MYTHIC") => ({
  cardId: name,
  anilistId: 1,
  name,
  nameNative: null,
  imageUrl: "x",
  appearance: {},
  rank: 1,
  rarity,
  power: 1,
  ki: 1,
  spoiler: false,
  series: "S",
});
const table = (over: Partial<CoinFlipTableView> = {}): CoinFlipTableView => ({
  id: "t1",
  status: "OPEN",
  creatorId: "sora",
  creatorSide: "OMOTE",
  tierOrder: 500,
  reservedForId: null,
  opponentId: null,
  seed: null,
  seedHash: "ab".repeat(32),
  result: null,
  winnerId: null,
  createdAt: new Date(NOW - 120_000).toISOString(),
  expiresAt: new Date(NOW + 86_000_000).toISOString(),
  resolvedAt: null,
  creator: player("Sora_ame"),
  reservedFor: null,
  opponent: null,
  creatorCard: card("Satoru Gojou"),
  opponentCard: null,
  rarity: "MYTHIC",
  mine: false,
  forMe: false,
  viewerSide: null,
  outcome: null,
  winnerNew: false,
  replayPending: false,
  ...over,
});

const base = {
  tab: "tables" as const,
  tiers: [
    { key: "RARE", order: 200, rarities: ["RARE"] },
    { key: "MYTHIC", order: 500, rarities: ["MYTHIC", "BR"] },
  ],
  tier: null as string | null,
  lobby: { items: [table()], nextCursor: null as string | null },
  mine: null as ComponentProps<typeof CoinFlipSalon>["mine"],
  history: null as ComponentProps<typeof CoinFlipSalon>["history"],
  canPlay: true,
  allowed: ["RARE", "MYTHIC", "BR"],
  expiryHours: 24,
  pollSeconds: 20,
  reserveFor: null as string | null,
  replays: [] as CoinFlipTableView[],
  serverNow: NOW,
};
const render = (props: Partial<typeof base> = {}) =>
  renderToStaticMarkup(createElement(NextIntlClientProvider, providerProps, createElement(CoinFlipSalon, { ...base, ...props })));

describe("salon du pile ou face", () => {
  it("liste les tables avec la fuda, le joueur, la face et « Relever »", () => {
    const html = render();
    expect(html).toContain('data-card="Satoru Gojou"');
    expect(html).toContain("Sora_ame");
    expect(html).toContain("joue Face");
    expect(html).toContain('href="/casino/pile-ou-face/t1"');
    expect(html).toContain("Relever");
    expect(html).toContain("Poser une carte");
  });

  it("propose un filtre par palier, les raretés de même rang ensemble", () => {
    const html = render({ tier: "MYTHIC" });
    expect(html).toContain('href="/casino/pile-ou-face?palier=MYTHIC"');
    expect(html).toContain("Mythique · Black Rare");
    expect(html).toMatch(/aria-current="page"[^>]*>[^<]*<span[^>]*>神/);
  });

  it("état vide, et message aux invités à la place du bouton", () => {
    const html = render({ lobby: { items: [], nextCursor: null }, canPlay: false });
    expect(html).toContain("Aucune table ouverte pour l&#x27;instant");
    expect(html).toContain("Crée un compte pour jouer");
    expect(html).not.toContain("Poser une carte");
  });

  it("une table réservée au lecteur est signalée", () => {
    expect(render({ lobby: { items: [table({ forMe: true, reservedForId: "me" })], nextCursor: null } })).toContain("Réservée pour toi");
  });
});
