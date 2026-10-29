import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import fr from "@/messages/fr.json";
import type { CardView } from "@/lib/boosters/view";
import type { PlayerRef } from "@/server/profile/decor";
import { WikiCardOwnersList } from "./WikiCardOwnersList";

vi.mock("next-intl", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-intl")>();
  return { ...original, useTranslations: (namespace: "wiki.owners") => original.createTranslator({ locale: "fr", messages: fr, namespace }) };
});
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement("a", { ...props, href }, children),
}));
vi.mock("next/image", () => ({
  default: ({ src, alt, className }: { src: string; alt: string; className: string }) => createElement("img", { src, alt, className }),
}));
vi.mock("@/server/actions/trades", () => ({ proposeTradeAction: vi.fn() }));
vi.mock("@/server/actions/collection", () => ({ loadCollectionPage: vi.fn() }));

const card: CardView = {
  cardId: "card-a", anilistId: 1, series: "Attack on Titan", name: "Levi", nameNative: "リヴァイ", imageUrl: "https://s4.anilist.co/levi.png",
  rank: 2, rarity: "MYTHIC", power: 100, ki: 84,
};
const player = (username: string): PlayerRef => ({ id: `id-${username}`, username, image: null, isGuest: false, decor: { frame: null, nameColor: null } });

const render = (props: Partial<Parameters<typeof WikiCardOwnersList>[0]> = {}) =>
  renderToStaticMarkup(createElement(WikiCardOwnersList, {
    name: "Levi", card, friends: [player("hanji")], others: [player("erwin"), player("mikasa")], othersTotal: 2,
    showFriends: true, block: null, othersBlocked: false, maxOffered: 5, allowedRarities: ["MYTHIC"], ...props,
  }));

describe("fiche wiki : joueurs qui possèdent la carte", () => {
  it("sépare les amis des autres joueurs, chacun avec son bouton d'échange", () => {
    const html = render();
    expect(html).toContain("Ils possèdent Levi");
    expect(html.indexOf("Tes amis")).toBeLessThan(html.indexOf("Autres joueurs"));
    expect(html).toContain('href="/u/hanji"');
    expect(html).toContain('href="/u/erwin"');
    expect(html.match(/>Demander l&#x27;échange</g)).toHaveLength(3);
    expect(html).toContain('aria-label="Demander l&#x27;échange de Levi à mikasa"');
  });

  it("annonce les joueurs non affichés et les groupes vides", () => {
    const html = render({ friends: [], othersTotal: 30 });
    expect(html).toContain("Aucun de tes amis n&#x27;a Levi pour l&#x27;instant.");
    expect(html).toContain("Et 28 autres joueurs.");
  });

  it("montre la liste sans bouton quand l'échange est impossible, avec la raison", () => {
    const guest = render({ block: "guest", showFriends: false });
    expect(guest).not.toContain("Tes amis");
    expect(guest).not.toContain(">Demander l&#x27;échange<");
    expect(guest).toContain("Crée ton compte pour demander un échange");
    expect(guest).toContain('href="/u/erwin"');
  });

  it("garde les boutons des amis quand les échanges hors amis sont fermés", () => {
    const html = render({ othersBlocked: true });
    expect(html.match(/>Demander l&#x27;échange</g)).toHaveLength(1);
    expect(html).toContain("Les échanges hors amis sont fermés pour le moment.");
  });
});
