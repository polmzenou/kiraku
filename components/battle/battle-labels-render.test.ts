import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import fr from "@/messages/fr.json";
import en from "@/messages/en.json";
import { createState } from "@/lib/battle/engine";
import { fighter, setupOf } from "@/lib/battle/fixtures";
import { ACTION_KANJI } from "@/lib/battle/glyphs";
import { TECHNIQUES, type Keyword } from "@/lib/battle/types";
import { CutIn } from "./fx/CutIn";
import { PlayerBanner, Tablets } from "./hud/Hud";
import { StageCard } from "./stage/StageCard";
import { SynergyFilament } from "./stage/SynergyFilament";

// Techniques, passifs et états s'affichent par leur nom traduit, jamais en kanji : seules les icônes des
// tablettes d'action en gardent, doublées de leur libellé.

vi.mock("@/i18n/navigation", async () => {
  const { createElement: h } = await import("react");
  return { Link: (props: Record<string, unknown>) => h("a", props) };
});
// La face de la carte a ses propres tests : seuls les calques du combat posés dessus comptent ici
vi.mock("@/components/fuda/Fuda", () => ({ Fuda: () => null }));
vi.mock("@/components/fuda/CardBack", () => ({ CardBack: () => null }));

const JAPANESE = /[぀-ヿ㐀-鿿]/;
const MESSAGES = { fr, en };
const noop = () => {};

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

describe("filament de synergie", () => {
  const of = (lit = true) => renderToStaticMarkup(createElement(SynergyFilament, { side: 0, lit }));

  it("le halo et 3 tracés, sans dépendre du niveau d'effets : le CSS masque, l'hydratation reste juste", () => {
    expect(of().split("<svg").length - 1).toBe(4);
    expect(of().split('class="filament-bolt"').length - 1).toBe(3);
  });

  it("reste masqué aux lecteurs d'écran, n'utilise aucun filtre, et s'éteint sans disparaître (fondu)", () => {
    const html = of(false);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("filter");
    expect(html).not.toContain("data-lit");
    expect(of()).toContain("data-lit");
    expect(html).toContain('data-synergy="0"');
  });
});

describe.each(["fr", "en"] as const)("libellés du combat (%s)", (locale) => {
  const battle = MESSAGES[locale].battle;

  it("le cut-in nomme la technique dans la langue du joueur, en complet comme en bref", () => {
    for (const technique of TECHNIQUES) {
      const setup = setupOf([fighter({ technique, name: "Akane" }), fighter(), fighter()], [fighter(), fighter(), fighter()]);
      for (const full of [true, false]) {
        const html = render(locale, createElement(CutIn, { cutin: { id: 1, actor: { side: 0, index: 0 }, technique, full, ms: 900 }, setup, mySide: 0 }));
        expect(html).toContain(`>${battle.techniques[technique].name}</b>`);
        expect(html).not.toMatch(JAPANESE);
      }
    }
  });

  it("la tablette de technique porte le nom traduit, sous la seule icône de l'action", () => {
    for (const technique of TECHNIQUES) {
      const html = render(
        locale,
        createElement(Tablets, {
          mode: "TECHNIQUE",
          attack: { enabled: true, onPress: noop },
          technique: { technique, cost: 2, enabled: true, onPress: noop },
          end: { enabled: true, pulse: false, onPress: noop },
        }),
      );
      expect(html).toContain(battle.techniques[technique].name);
      const withoutIcons = Object.values(ACTION_KANJI).reduce((h, icon) => h.replaceAll(icon, ""), html);
      expect(withoutIcons).not.toMatch(JAPANESE);
    }
  });

  it("la carte écrit ses passifs, son sceau et son K.-O. en toutes lettres", () => {
    const keywords: Keyword[] = ["TAUNT", "LAST_WILL", "REVIVE"];
    const setup = setupOf([fighter({ keywords }), fighter(), fighter()], [fighter(), fighter(), fighter()]);
    const base = createState(setup).state.fighters[0][0];
    const props = { slot: { side: 0, index: 0 }, card: setup.teams[0][0], atkBonus: 0, face: "front", numbers: [], register: noop, sizes: "100px" } as const;

    const sealed = render(locale, createElement(StageCard, { ...props, state: { ...base, sealed: true } }));
    for (const k of keywords) expect(sealed).toContain(`class="stage-kw">${battle.keywords[k].name}</span>`);
    expect(sealed).toContain(`class="st-seal-fuda">${battle.board.sealed}</span>`);
    expect(sealed).not.toMatch(JAPANESE);

    const dead = render(locale, createElement(StageCard, { ...props, state: { ...base, hp: 0 } }));
    expect(dead).toContain(`class="stage-ko">${battle.board.ko}</span>`);
    expect(dead).not.toMatch(JAPANESE);
  });

  it("la gemme d'attaque et la mention accessible comptent la synergie, additionnée à l'encouragement", () => {
    const setup = setupOf([fighter({ power: 100 }), fighter(), fighter()], [fighter(), fighter(), fighter()]);
    const base = createState(setup).state.fighters[0][0];
    const props = { slot: { side: 0, index: 0 }, card: setup.teams[0][0], face: "front", numbers: [], register: noop, sizes: "100px" } as const;
    const bonus = battle.board.synergyBonus.replace("{pct}", "10").replace(/'/g, "&#x27;");

    const synergy = render(locale, createElement(StageCard, { ...props, state: base, atkBonus: 10 }));
    expect(synergy).toContain(">110</span>");
    expect(synergy).toContain("data-buffed");
    expect(synergy).toContain(bonus);

    const none = render(locale, createElement(StageCard, { ...props, state: base, atkBonus: 0 }));
    expect(none).toContain(">100</span>");
    expect(none).not.toContain(bonus);

    const both = render(locale, createElement(StageCard, { ...props, state: { ...base, buffPct: 20, buffTurns: 1 }, atkBonus: 30 }));
    expect(both).toContain(">130</span>");
    expect(both).toContain(bonus);
  });

  it("la bannière porte la puce de synergie et nomme l'univers aux lecteurs d'écran", () => {
    const player = { bot: "ONI" } as const;
    const banner = (synergy: { key: string; name: string; atkPct: number } | null) =>
      render(locale, createElement(PlayerBanner, { player, place: "top", active: false, standing: 3, tier: null, synergy }));
    const on = banner({ key: "u1", name: "Jujutsu Kaisen", atkPct: 10 });
    expect(on).toContain("Jujutsu Kaisen");
    expect(on).toContain(battle.synergy.chip.replace("{pct}", "10"));
    expect(banner(null)).not.toContain("player-synergy");
  });
});
