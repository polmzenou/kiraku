import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import fr from "@/messages/fr.json";
import en from "@/messages/en.json";
import { BASE_DEFINITIONS } from "@/lib/catalog/definitions";
import type { CoinFlipTableView } from "@/server/casino/queries";

// Page d'une table : attente (créateur), relève refusée d'avance (spectateur), résultat vu par un spectateur.

vi.mock("@/server/actions/casino", () => ({ cancelCoinFlipAction: vi.fn(), coinFlipTableAction: vi.fn(), joinCoinFlipAction: vi.fn(), markCoinFlipsSeenAction: vi.fn() }));
vi.mock("@/components/realtime/RealtimeProvider", () => ({ useRealtime: () => ({ subscribe: () => () => {} }) }));
vi.mock("@/components/realtime/usePoll", () => ({ usePoll: () => () => {} }));
vi.mock("@/components/realtime/activity", () => ({ useHoldAwake: () => {} }));
vi.mock("@/components/referral/ShareCode", () => ({ useShareCode: () => null }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/image", async () => {
  const { createElement: h } = await import("react");
  return { default: ({ src, alt }: { src: string; alt: string }) => h("img", { src, alt }) };
});
vi.mock("@/components/collection/CardPickGrid", async () => {
  const { createElement: h } = await import("react");
  return { CardPickGrid: () => h("div", { "data-grid": "pick" }) };
});
vi.mock("@/components/collection/CopyPicker", () => ({ CopyPicker: () => null }));
vi.mock("@/components/fuda/Fuda", async () => {
  const { createElement: h } = await import("react");
  return { Fuda: ({ card }: { card: { name: string } }) => h("span", { "data-card": card.name }) };
});
vi.mock("@/lib/catalog/use-rarities", () => ({ useRaritySeals: () => ({ MYTHIC: "神", BR: "闇" }) }));
vi.mock("@/i18n/navigation", async () => {
  const { createElement: h } = await import("react");
  return { Link: ({ prefetch, ...props }: Record<string, unknown>) => (void prefetch, h("a", props)), useRouter: () => ({ refresh() {}, push() {} }), getPathname: () => "/" };
});
const { CoinFlipTable } = await import("./CoinFlipTable");

const messages = {
  fr: { ...fr, rarity: { ...fr.rarity, ...Object.fromEntries(BASE_DEFINITIONS.map((r) => [r.key, r.nameFr])) } },
  en: { ...en, rarity: { ...en.rarity, ...Object.fromEntries(BASE_DEFINITIONS.map((r) => [r.key, r.nameEn])) } },
};
const NOW = Date.parse("2026-12-05T12:00:00.000Z");
const player = (username: string) => ({ id: username, username, image: null, isGuest: false, decor: { frame: null, nameColor: null, prestige: 0 } });
const card = (name: string, rarity = "MYTHIC") => ({ cardId: name, anilistId: 1, name, nameNative: null, imageUrl: "x", appearance: {}, rank: 1, rarity, power: 1, ki: 1, spoiler: false, series: "S" });
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
const DONE = { status: "DONE" as const, opponentId: "nami", opponent: player("Nami"), opponentCard: card("Levi", "BR"), result: "URA" as const, winnerId: "nami", resolvedAt: new Date(NOW).toISOString(), seed: "cd".repeat(32) };

const base: ComponentProps<typeof CoinFlipTable> = { initial: table(), viewerId: "me", canJoin: true, joinBlock: null, joinRarities: ["MYTHIC", "BR"], pollSeconds: 5, serverNow: NOW };
const providerProps = (locale: "fr" | "en") => ({ locale, messages: messages[locale], timeZone: "Europe/Paris", onError: (e: Error) => { throw e; }, children: null });
const render = (props: Partial<typeof base>, locale: "fr" | "en" = "fr") =>
  renderToStaticMarkup(createElement(NextIntlClientProvider, providerProps(locale), createElement(CoinFlipTable, { ...base, ...props })));

describe("page d'une table de pile ou face", () => {
  it("relève possible : la fuda misée, les faces, la grille et « Lancer la pièce »", () => {
    const html = render({});
    expect(html).toContain("Table de Sora_ame");
    expect(html).toContain('data-grid="pick"');
    expect(html).toContain("Lancer la pièce");
    // Retour au salon : zone tactile de 44 px
    expect(html).toMatch(/<a[^>]*min-h-11[^>]*>‹ Pile ou face/);
  });

  it("refus déjà connu (compte trop récent) : la raison à la place du choix de la fuda", () => {
    const html = render({ canJoin: false, joinBlock: "TOO_NEW" });
    expect(html).toContain("Ton compte est trop récent pour miser");
    expect(html).not.toContain('data-grid="pick"');
    expect(html).not.toContain("Lancer la pièce");
  });

  it("le créateur attend sa table : invitation et retrait", () => {
    const html = render({ initial: table({ mine: true, creatorId: "me" }), canJoin: false });
    expect(html).toContain("Ta table");
    expect(html).toContain("En attente d&#x27;un joueur");
    expect(html).toContain("Inviter");
  });

  it("table jouée vue par un spectateur : le gagnant, la face sortie, la vérification", () => {
    const html = render({ initial: table(DONE), canJoin: false });
    expect(html).toContain("Nami a remporté Satoru Gojou.");
    expect(html).toContain("Vérifier le tirage");
    expect(html).not.toContain("Revanche");
  });

  it("se rend en anglais sans message manquant", () => {
    for (const props of [{}, { canJoin: false, joinBlock: "DAILY_LIMIT" as const }, { initial: table(DONE), canJoin: false }]) {
      expect(render(props, "en")).not.toMatch(/MISSING_MESSAGE|NaN|undefined/);
    }
  });
});
