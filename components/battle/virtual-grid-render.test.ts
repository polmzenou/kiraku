import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import fr from "@/messages/fr.json";
import { abilityRules, DEFAULT_BATTLE_RULES } from "@/lib/battle/config";
import type { CandidateCard, WorkshopCard } from "@/lib/battle/view";
import { TeamPicker } from "./TeamPicker";
import { FIRST_PAINT_ITEMS, gridColumns } from "./VirtualCardGrid";
import { WorkshopBrowser } from "./WorkshopBrowser";

// Grilles de cartes du combat : une collection de plusieurs centaines de cartes à effets, montée d'un
// coup, faisait tuer l'onglet par iOS (« Un problème récurrent est survenu » à l'ouverture du choix
// d'équipe). Seules quelques cartes existent avant la mise en page, puis les lignes à l'écran.

vi.mock("@/i18n/navigation", async () => {
  const { createElement: h } = await import("react");
  return {
    Link: ({ href, ...props }: { href: string } & Record<string, unknown>) => h("a", { href, ...props }),
    useRouter: () => ({ push: () => {}, refresh: () => {} }),
  };
});
vi.mock("@/server/actions/battle", () => ({ buyAbilityAction: vi.fn(), equipAbilitiesAction: vi.fn() }));
// La face de la carte a ses propres tests : on ne garde que son identité et son mode figé
vi.mock("@/components/fuda/Fuda", async () => {
  const { createElement: h } = await import("react");
  return {
    Fuda: (p: { card: { cardId: string }; still?: boolean }) => h("i", { "data-fuda": p.card.cardId, "data-still": p.still ? "yes" : "no" }),
  };
});

const abilities = abilityRules(DEFAULT_BATTLE_RULES);

function render(node: ReactElement) {
  const props = {
    locale: "fr" as const,
    messages: fr,
    timeZone: "UTC",
    onError: (e: Error) => {
      throw e;
    },
    children: null,
  };
  return renderToStaticMarkup(createElement(NextIntlClientProvider, props, node));
}

const candidate = (i: number): CandidateCard => ({
  cardId: `c${i}`,
  anilistId: i,
  name: `Carte ${i}`,
  nameNative: null,
  imageUrl: "/x.webp",
  rank: i,
  rarity: i % 2 ? "GOLD" : "MYTHIC",
  power: 60,
  ki: 60,
  hp: 176,
  keywords: ["FLURRY", "POISON"],
  technique: "ISSEN",
  ultimate: i % 2 ? "FUDO" : null,
  universe: { key: `s${i}`, name: `Série ${i}` },
});

const workshop = (i: number): WorkshopCard => ({
  ...candidate(i),
  slots: 2,
  base: { keywords: ["FLURRY", "POISON"], technique: "ISSEN" },
  owned: { keywords: ["FLURRY", "POISON"], techniques: ["ISSEN"] },
});

const fudas = (markup: string) => [...markup.matchAll(/data-fuda="([^"]+)" data-still="(yes|no)"/g)].map((m) => ({ id: m[1], still: m[2] === "yes" }));

describe("grilles de cartes du combat", () => {
  it("garde les colonnes de l'ancienne grille : 3, puis 4 (≥ 640), 5 (≥ 768) et 6 (≥ 1280)", () => {
    expect([320, 375, 639].map(gridColumns)).toEqual([3, 3, 3]);
    expect([640, 767].map(gridColumns)).toEqual([4, 4]);
    expect([768, 1024, 1279].map(gridColumns)).toEqual([5, 5, 5]);
    expect([1280, 1920].map(gridColumns)).toEqual([6, 6]);
  });

  it("choix d'équipe : 400 cartes, seules les premières sont montées avant la mise en page, toutes figées", () => {
    const candidates = Array.from({ length: 400 }, (_, i) => candidate(i));
    const out = render(
      createElement(TeamPicker, { open: true, onClose: () => {}, candidates, decks: [], abilities, initial: [], confirmLabel: "OK", pending: false, onConfirm: () => {} }),
    );
    const cards = fudas(out);
    expect(cards).toHaveLength(FIRST_PAINT_ITEMS);
    expect(cards.map((c) => c.id)).toEqual(candidates.slice(0, FIRST_PAINT_ITEMS).map((c) => c.cardId));
    expect(cards.every((c) => c.still)).toBe(true);
    expect(out).toContain('aria-label="Ajouter Carte 0"');
    expect(out).not.toContain('aria-label="Ajouter Carte 399"');
    expect(out).toContain('role="list"');
    expect(out.split('role="listitem"')).toHaveLength(FIRST_PAINT_ITEMS + 1);
  });

  it("choix d'équipe : une petite collection s'affiche en entier", () => {
    const candidates = Array.from({ length: 5 }, (_, i) => candidate(i));
    const out = render(
      createElement(TeamPicker, { open: true, onClose: () => {}, candidates, decks: [], abilities, initial: [], confirmLabel: "OK", pending: false, onConfirm: () => {} }),
    );
    expect(fudas(out).map((c) => c.id)).toEqual(["c0", "c1", "c2", "c3", "c4"]);
  });

  it("choix d'équipe : les cartes déjà dans l'équipe restent en haut, numérotées, hors de la grille", () => {
    const candidates = Array.from({ length: 400 }, (_, i) => candidate(i));
    const out = render(
      createElement(TeamPicker, { open: true, onClose: () => {}, candidates, decks: [], abilities, initial: ["c300", "c301", "c302"], confirmLabel: "OK", pending: false, onConfirm: () => {} }),
    );
    // Les 3 emplacements montrent l'équipe même quand ses cartes sont loin dans la liste
    for (const id of ["c300", "c301", "c302"]) expect(out).toContain(`aria-label="Retirer Carte ${id.slice(1)}"`);
    expect(fudas(out).filter((c) => !c.still).map((c) => c.id)).toEqual(["c300", "c301", "c302"]);
  });

  it("atelier : 400 cartes, seules les premières sont montées, toutes figées", () => {
    const cards = Array.from({ length: 400 }, (_, i) => workshop(i));
    const out = render(createElement(WorkshopBrowser, { cards, coins: 0, rules: { ...abilities, abilityPrices: DEFAULT_BATTLE_RULES.abilityPrices }, initialCardId: null }));
    expect(fudas(out)).toHaveLength(FIRST_PAINT_ITEMS);
    expect(fudas(out).every((c) => c.still)).toBe(true);
    expect(out.split("Ouvrir l&#x27;atelier de").length - 1).toBe(FIRST_PAINT_ITEMS);
  });
});
