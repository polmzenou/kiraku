import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import fr from "@/messages/fr.json";
import type { ShowcaseCard } from "@/lib/collection/view";
import type { PodiumEntry, ShowcaseEntryView } from "@/lib/event/view";
import { SHOWCASE_THEMES } from "@/lib/showcase/theme-registry";
import { EntryCard } from "./EntryCard";
import { ShowcaseEventPodium } from "./ShowcaseEventPodium";
import { VoteButton, VoteProvider } from "./VoteProvider";

vi.mock("next-intl", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-intl")>();
  return { ...original, useTranslations: (namespace?: string) => original.createTranslator({ locale: "fr", messages: fr, namespace: namespace as "event" }) };
});
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement("a", { ...props, href }, children),
}));
vi.mock("@/server/actions/showcase-event", () => ({ voteShowcaseEntryAction: vi.fn(), clearShowcaseVoteAction: vi.fn() }));

const card = (id: string, spoiler = false): ShowcaseCard => ({
  cardId: id, anilistId: 1, position: 1, name: `Carte ${id}`, nameNative: null, imageUrl: `https://s4.anilist.co/${id}.png`,
  rank: 1, rarity: "MYTHIC", power: 90, ki: 70, appearance: {}, series: "Série", spoiler,
});
const player = { id: "u-akane", username: "Akane", image: null, decor: { frame: null, nameColor: null } };
const entry: ShowcaseEntryView = {
  id: "e1", player, name: "Nuées d'or", layout: "GRID_3X2", theme: "gold",
  cards: [card("a"), null, card("spoil", true), null, null, null],
};

const withVote = (vote: string | null, node: ReactNode) => renderToStaticMarkup(createElement(VoteProvider, { initial: vote, children: node }));

describe("vitrine de l'event", () => {
  it("« Vitrine de [pseudo] » au-dessus, la vitrine en galerie, puis « Voter pour [pseudo] », sans compteur", () => {
    const html = withVote(null, createElement(EntryCard, { entry, action: createElement(VoteButton, { entryId: "e1", name: "Akane" }) }));
    expect(html).toContain("Vitrine de Akane");
    expect(html).toContain("Voter pour Akane");
    expect(html.indexOf("Vitrine de ")).toBeLessThan(html.indexOf("vt-stage"));
    expect(html.indexOf("vt-stage")).toBeLessThan(html.indexOf("Voter pour Akane"));
    expect(html).not.toMatch(/\d+ votes?/);
  });

  it("galerie légère : image fixe chargée à l'approche, ni vidéo ni effet de rareté, cartes spoil marquées", () => {
    const html = renderToStaticMarkup(createElement(EntryCard, { entry }));
    expect(html).toContain(`src="${SHOWCASE_THEMES.gold.media!.mobile.still}"`);
    expect(html).toContain('loading="lazy"');
    expect(html).not.toContain("<video");
    expect(html).not.toContain("rarity-halo");
    expect(html.match(/<img[^>]*data-spoiler/g)).toHaveLength(1);
    expect(html.match(/class="vt-empty"/g)).toHaveLength(4);
  });

  it("vitrine choisie : « Ton vote » et « Retirer mon vote »", () => {
    const html = withVote("e1", createElement(VoteButton, { entryId: "e1", name: "Akane" }));
    expect(html).toContain("Ton vote");
    expect(html).toContain("Retirer mon vote");
    expect(html).not.toContain("Voter pour");
    // Un autre bouton de la page redevient « Voter pour »
    expect(withVote("e1", createElement(VoteButton, { entryId: "e2", name: "Kuro" }))).toContain("Voter pour Kuro");
  });

  it("après la clôture : sa place et ses votes", () => {
    const html = renderToStaticMarkup(createElement(EntryCard, { entry, result: { entryId: "e1", rank: 1, votes: 12 } }));
    expect(html).toContain("1re");
    expect(html).toContain("12 votes");
  });

  it("podium 2-1-3 avec les votes, chaque place mène à sa vitrine", () => {
    const podium: PodiumEntry[] = [1, 2, 3].map((rank) => ({ entryId: `e${rank}`, rank, votes: 10 - rank, player: { ...player, id: `u${rank}`, username: `Joueur${rank}` } }));
    const html = renderToStaticMarkup(createElement(ShowcaseEventPodium, { podium, label: "Podium" }));
    expect(html).toContain('href="/event#vitrine-e1"');
    expect(html).toContain("金");
    expect(html).toContain("9 votes");
    expect(html.indexOf("Joueur1")).toBeLessThan(html.indexOf("Joueur2"));
    expect(renderToStaticMarkup(createElement(ShowcaseEventPodium, { podium: [], label: "Podium" }))).toBe("");
  });
});
