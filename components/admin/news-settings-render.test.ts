import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import fr from "@/messages/fr.json";
import type { NewsVisuals } from "@/lib/home/news";
import { NEWS_DEFAULT, type NewsConfig } from "@/lib/home/news-schema";

vi.mock("@/server/actions/admin-settings", () => ({ updateNewsSettings: vi.fn(), previewNewsVisuals: vi.fn() }));
vi.mock("@/server/actions/admin-boosters", () => ({ searchFeaturedCards: vi.fn() }));
vi.mock("@/server/actions/welcome", () => ({ voteDiscordPollAction: vi.fn() }));
vi.mock("@/components/fuda/Fuda", async () => {
  const { createElement: h } = await import("react");
  return { Fuda: ({ card }: { card: { name: string } }) => h("span", { "data-card": card.name }) };
});
vi.mock("@/i18n/navigation", async () => {
  const { createElement: h } = await import("react");
  return { Link: (props: Record<string, unknown>) => h("a", props), useRouter: () => ({ refresh() {} }) };
});
const { NewsSettingsForm } = await import("./NewsSettingsForm");
const providerProps = { locale: "fr" as const, messages: fr, timeZone: "Europe/Paris", children: null };

const boosters = [
  { slug: "imperial", name: "Impérial", active: true },
  { slug: "ancien", name: "Ancien", active: false },
];
const render = (config: NewsConfig, initialVisuals: NewsVisuals = {}) =>
  renderToStaticMarkup(createElement(NextIntlClientProvider, providerProps, createElement(NewsSettingsForm, { initial: { "home.news": config }, boosters, initialVisuals })));

describe("formulaire admin des Nouveautés", () => {
  it("présente chaque nouveauté, l'aperçu en carrousel et la case de réouverture cochée", () => {
    const html = render(NEWS_DEFAULT);
    NEWS_DEFAULT.items.forEach((_, i) => expect(html).toContain(`Nouveauté ${i + 1}`));
    expect(html).toContain(`Nouveautés (${NEWS_DEFAULT.items.length}/6)`);
    expect(html).toContain('aria-roledescription="carrousel"');
    expect(html).toContain("Mis à jour le 30 octobre");
    expect(html).toMatch(/<input type="checkbox" class="choice" checked=""\/><span>Rouvrir l&#x27;encart/);
  });

  it("propose les visuels, les étiquettes et les boosters, éteints signalés", () => {
    const html = render(NEWS_DEFAULT);
    expect(html).toContain("Visuel de la bannière");
    for (const label of ["Sceau seulement", "Cartes du catalogue", "Un booster", "Image téléversée"]) expect(html).toContain(label);
    expect(html).toContain(">Nouvelles cartes</option>");
    expect(html).toContain('<option value="imperial" selected="">Impérial</option>');
    expect(html).toContain("Ancien (éteint)");
  });

  it("nomme les cartes choisies d'après les visuels déjà résolus, et invite à téléverser une image", () => {
    const config: NewsConfig = {
      ...NEWS_DEFAULT,
      items: [
        { ...NEWS_DEFAULT.items[0], id: "cartes", visual: { kind: "cards", cardIds: ["cmvp2nn9s000008kzmfofvtxj"] } },
        { ...NEWS_DEFAULT.items[1], id: "image", visual: { kind: "image", url: "", focalX: 50, focalY: 50 } },
      ],
    };
    const card = { id: "cmvp2nn9s000008kzmfofvtxj", name: "Giorno Giovanna", nameNative: null, imageUrl: "https://s4.anilist.co/g.png", rank: 1, rarity: "AR" as const, power: 90, ki: 80, appearance: {}, formName: null };
    const html = render(config, { cartes: { kind: "cards", cards: [card] } });
    expect(html).toContain("Retirer Giorno Giovanna");
    expect(html).toContain('data-card="Giorno Giovanna"');
    expect(html).toContain("Téléverser une image");
  });
});
