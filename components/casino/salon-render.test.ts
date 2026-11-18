import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import fr from "@/messages/fr.json";
import en from "@/messages/en.json";
import { BASE_DEFINITIONS } from "@/lib/catalog/definitions";
import type { CoinFlipTableView } from "@/server/casino/queries";

vi.mock("@/server/actions/casino", () => ({ coinFlipLobbyAction: vi.fn(), coinFlipMineAction: vi.fn(), declineCoinFlipAction: vi.fn(), createCoinFlipAction: vi.fn() }));
vi.mock("@/components/realtime/RealtimeProvider", () => ({ useRealtime: () => ({ subscribe: () => () => {} }) }));
vi.mock("next/image", async () => {
  const { createElement: h } = await import("react");
  return { default: ({ src, alt }: { src: string; alt: string }) => h("img", { src, alt }) };
});
vi.mock("@/server/actions/collection", () => ({ loadCollectionPage: vi.fn(() => new Promise(() => {})) }));
vi.mock("@/components/fuda/Fuda", async () => {
  const { createElement: h } = await import("react");
  return { Fuda: ({ card }: { card: { name: string } }) => h("span", { "data-card": card.name }) };
});
vi.mock("@/components/realtime/usePoll", () => ({ usePoll: () => () => {} }));
vi.mock("@/lib/catalog/use-rarities", () => ({ useRaritySeals: () => ({ MYTHIC: "神", BR: "闇", RARE: "稀" }), useRarities: () => ["RARE", "MYTHIC", "BR"], useFilterRarities: () => ["RARE", "MYTHIC", "BR"] }));
vi.mock("@/i18n/navigation", async () => {
  const { createElement: h } = await import("react");
  return { Link: ({ prefetch, ...props }: Record<string, unknown>) => (void prefetch, h("a", props)), useRouter: () => ({ refresh() {}, push() {} }) };
});
const { CoinFlipSalon } = await import("./CoinFlipSalon");
// Comme i18n/request.ts : les noms du registre complètent l'espace « rarity » (variantes comprises)
const messages = {
  fr: { ...fr, rarity: { ...fr.rarity, ...Object.fromEntries(BASE_DEFINITIONS.map((r) => [r.key, r.nameFr])) } },
  en: { ...en, rarity: { ...en.rarity, ...Object.fromEntries(BASE_DEFINITIONS.map((r) => [r.key, r.nameEn])) } },
};
const providerProps = (locale: "fr" | "en") => ({ locale, messages: messages[locale], timeZone: "Europe/Paris", onError: (e: Error) => { throw e; }, children: null });

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
  counts: { mine: 0, invitations: 0 } as ComponentProps<typeof CoinFlipSalon>["counts"],
  maxOpenTables: 3,
  signature: "m=|i=|r=" as string | null,
  pulse: { openTables: 12, flipsToday: 1 },
  serverNow: NOW,
};
const render = (props: Partial<typeof base> = {}, locale: "fr" | "en" = "fr") =>
  renderToStaticMarkup(createElement(NextIntlClientProvider, providerProps(locale), createElement(CoinFlipSalon, { ...base, ...props })));

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

  it("en-tête : règle du jeu et pouls du salon", () => {
    const html = render();
    expect(html).toContain("Le gagnant repart avec les deux");
    expect(html).toContain("12 tables ouvertes · 1 lancer aujourd&#x27;hui");
    expect(html).toContain("Expire dans");
  });

  it("état vide, et message aux invités à la place du bouton", () => {
    const html = render({ lobby: { items: [], nextCursor: null }, canPlay: false, signature: null, counts: null });
    expect(html).toContain("Aucune table ouverte pour l&#x27;instant");
    expect(html).toContain("Crée un compte pour jouer");
    expect(html).not.toContain("Poser une carte");
  });

  it("état vide d'un membre : « Poser une carte » dans l'état vide", () => {
    const html = render({ lobby: { items: [], nextCursor: null } });
    expect(html.match(/Poser une carte/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("une table réservée au lecteur est signalée", () => {
    expect(render({ lobby: { items: [table({ forMe: true, reservedForId: "me" })], nextCursor: null } })).toContain("Réservée pour toi");
  });

  it("« Mes tables » : invitations en tête, compteur, temps restant, pastilles de l'onglet", () => {
    const mine = {
      mine: [table({ id: "m1", mine: true, creatorId: "me", creator: player("Kata"), reservedFor: player("Nami"), reservedForId: "nami" })],
      invitations: [table({ id: "i1", forMe: true, reservedForId: "me" })],
    };
    const html = render({ tab: "mes-tables" as never, lobby: null as never, mine, counts: { mine: 1, invitations: 1 }, replays: [table({ id: "r1", status: "DONE", mine: true, opponent: player("Nami") })] });
    expect(html.indexOf("Tables réservées pour toi")).toBeLessThan(html.indexOf("Tes tables ouvertes"));
    expect(html).toContain("1 / 3");
    expect(html).toMatch(/Pour <span[^>]*>Nami/);
    expect(html).toContain("1 table ouverte sur 3 possibles");
    expect(html).toContain("Décliner");
    expect(html).toContain("2 tables");
    expect(html).toContain("Un lancer t&#x27;attend");
  });

  it("« Mes tables » vide : pas de section d'invitations, état vide illustré", () => {
    const html = render({ tab: "mes-tables" as never, lobby: null as never, mine: { mine: [], invitations: [] } });
    expect(html).not.toContain("Tables réservées pour toi");
    expect(html).toContain("Tu n&#x27;as aucune table ouverte.");
    expect(html).toContain("0 / 3");
  });

  it("historique : tuiles joués, gagnés, perdus", () => {
    const history = { items: [], stats: { played: 5, won: 3, lost: 2, omote: 2, ura: 3, streak: 2 } };
    const html = render({ tab: "historique" as never, lobby: null as never, history });
    expect(html).toMatch(/Lancers<\/dt>/);
    expect(html).toContain("2 victoires d&#x27;affilée");
  });

  it.each(["tables", "mes-tables", "historique"] as const)("se rend en anglais sans message manquant (%s)", (tab) => {
    const props = {
      tab: tab as never,
      mine: { mine: [table({ mine: true })], invitations: [] },
      history: { items: [], stats: { played: 0, won: 0, lost: 0, omote: 0, ura: 0, streak: 0 } },
    };
    const html = render(props, "en");
    expect(html).not.toMatch(/MISSING_MESSAGE|NaN|undefined/);
    expect(html).toContain("The winner walks away with both");
  });
});
