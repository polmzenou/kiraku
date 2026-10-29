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
import { Tablets } from "./hud/Hud";
import { StageCard } from "./stage/StageCard";

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
    const props = { slot: { side: 0, index: 0 }, card: setup.teams[0][0], face: "front", numbers: [], register: noop, sizes: "100px" } as const;

    const sealed = render(locale, createElement(StageCard, { ...props, state: { ...base, sealed: true } }));
    for (const k of keywords) expect(sealed).toContain(`class="stage-kw">${battle.keywords[k].name}</span>`);
    expect(sealed).toContain(`class="st-seal-fuda">${battle.board.sealed}</span>`);
    expect(sealed).not.toMatch(JAPANESE);

    const dead = render(locale, createElement(StageCard, { ...props, state: { ...base, hp: 0 } }));
    expect(dead).toContain(`class="stage-ko">${battle.board.ko}</span>`);
    expect(dead).not.toMatch(JAPANESE);
  });
});
