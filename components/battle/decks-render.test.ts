import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import fr from "@/messages/fr.json";
import en from "@/messages/en.json";
import { DEFAULT_BATTLE_RULES } from "@/lib/battle/config";
import type { CandidateCard, DeckView } from "@/lib/battle/view";
import { DeckManager } from "./DeckManager";
import { TeamPicker } from "./TeamPicker";

vi.mock("@/i18n/navigation", async () => {
  const { createElement: h } = await import("react");
  return {
    Link: ({ href, ...props }: { href: string } & Record<string, unknown>) => h("a", { href, ...props }),
    useRouter: () => ({ push: () => {}, refresh: () => {} }),
  };
});
vi.mock("@/server/actions/battle", () => ({ saveDeckAction: vi.fn(), renameDeckAction: vi.fn(), deleteDeckAction: vi.fn() }));
// La face de la carte a ses propres tests : seuls les calques des decks comptent ici
vi.mock("@/components/fuda/Fuda", () => ({ Fuda: () => null }));

const MESSAGES = { fr, en };
const abilities = { keywordValues: DEFAULT_BATTLE_RULES.keywordValues, techniques: DEFAULT_BATTLE_RULES.techniques };

const providerProps = (locale: "fr" | "en") => ({
  locale,
  messages: MESSAGES[locale],
  timeZone: "UTC",
  onError: (e: Error) => {
    throw e;
  },
  children: null,
});

function render(locale: "fr" | "en", node: ReactElement) {
  return renderToStaticMarkup(createElement(NextIntlClientProvider, providerProps(locale), node));
}

// renderToStaticMarkup échappe les apostrophes
const html = (text: string) => text.replace(/'/g, "&#x27;");

const card = (cardId: string): CandidateCard => ({
  cardId,
  anilistId: 1,
  name: `Carte ${cardId}`,
  nameNative: null,
  imageUrl: "/x.webp",
  rank: 1,
  rarity: "RARE",
  power: 50,
  ki: 50,
  hp: 150,
  keywords: [],
  technique: "ISSEN",
});

const ready: DeckView = { id: "d1", name: "Deck CSM", cards: [card("a"), card("b"), card("c")], unavailable: [], playable: true };
const sold: DeckView = { id: "d2", name: "Deck JJK", cards: [card("a"), card("b"), card("z")], unavailable: ["z"], playable: false };

const manager = (decks: DeckView[], maxDecks = 10) => createElement(DeckManager, { decks, candidates: [], abilities, maxDecks });
const picker = (decks: DeckView[]) =>
  createElement(TeamPicker, { open: true, onClose: () => {}, candidates: [], decks, abilities, initial: [], confirmLabel: "OK", pending: false, onConfirm: () => {} });

describe.each(["fr", "en"] as const)("decks (%s)", (locale) => {
  const t = MESSAGES[locale].battle.decks;

  it("invite à créer un premier deck", () => {
    const out = render(locale, manager([]));
    expect(out).toContain(html(t.empty));
    expect(out).toContain(">0/10<");
    expect(out).toContain(t.new);
  });

  it("signale la carte indisponible d'un deck, sans toucher aux autres", () => {
    const out = render(locale, manager([ready, sold]));
    expect(out).toContain("Deck CSM");
    expect(out).toContain("Deck JJK");
    expect(out.split(`>${t.unavailable}<`)).toHaveLength(2);
    expect(out.split(html(t.unavailableHint))).toHaveLength(2);
    expect(out).toContain(">2/10<");
  });

  it("bloque la création à la limite, même dépassée après une baisse du réglage", () => {
    const out = render(locale, manager([ready, sold], 1));
    expect(out).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>${t.new}</button>`));
    expect(out).toContain(">2/1<");
  });

  it("le choix d'équipe propose les decks, sans le deck indisponible", () => {
    const out = render(locale, picker([ready, sold]));
    expect(out).toContain(t.manage);
    expect(out).toMatch(/<button[^>]*aria-pressed="false"[^>]*>Deck CSM<\/button>/);
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>Deck JJK/);
  });

  it("sans deck, le choix d'équipe n'offre qu'un lien de création", () => {
    const out = render(locale, picker([]));
    expect(out).toContain(t.create);
    expect(out).toContain('href="/combat/decks"');
    expect(out).not.toContain(t.manage);
  });
});
