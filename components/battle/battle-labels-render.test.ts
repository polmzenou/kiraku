import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import fr from "@/messages/fr.json";
import en from "@/messages/en.json";
import { abilityRules, DEFAULT_BATTLE_RULES } from "@/lib/battle/config";
import { createState } from "@/lib/battle/engine";
import { fighter, setupOf } from "@/lib/battle/fixtures";
import { ACTION_KANJI } from "@/lib/battle/glyphs";
import { KEYWORDS, TECHNIQUES, ULTIMATES, type Keyword } from "@/lib/battle/types";
import { AbilityLists } from "./AbilityGuide";
import { CardDetail } from "./BattleLog";
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
/** Texte tel que React l'échappe dans le HTML. */
const html = (text: string) => text.replace(/'/g, "&#x27;");

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

  it("la Rage compte dans la gemme et se nomme à part dans la mention accessible", () => {
    const setup = setupOf([fighter({ power: 100, keywords: ["RAGE"] }), fighter(), fighter()], [fighter(), fighter(), fighter()]);
    const base = createState(setup).state.fighters[0][0];
    const props = { slot: { side: 0, index: 0 }, card: setup.teams[0][0], face: "front", numbers: [], register: noop, sizes: "100px" } as const;
    const out = render(locale, createElement(StageCard, { ...props, state: base, atkBonus: 50, ragePct: 50 }));
    expect(out).toContain(">150</span>");
    expect(out).toContain(battle.board.rageBonus.replace("{pct}", "50").replace(/'/g, "&#x27;"));
    // La Rage ne doit pas passer pour de la synergie
    expect(out).not.toContain(battle.board.synergyBonus.replace("{pct}", "50").replace(/'/g, "&#x27;"));
  });

  it("le lexique écrit toutes les capacités, chiffres compris, sans paramètre manquant", () => {
    const rules = abilityRules(DEFAULT_BATTLE_RULES);
    const out = render(locale, createElement(AbilityLists, { rules }));
    for (const k of KEYWORDS) expect(out).toContain(battle.keywords[k].name);
    for (const t of TECHNIQUES) expect(out).toContain(battle.techniques[t].name);
    for (const u of ULTIMATES) expect(out).toContain(battle.ultimates[u].name);
    // Raretés concernées (clé si le registre ne les nomme pas) et règle de charge
    expect(out).toContain("GOLD");
    expect(out).toContain(String(DEFAULT_BATTLE_RULES.ultimateCharge.perAction));
    expect(out).not.toMatch(/\{[a-z]+[,}]/);
    expect(out).not.toMatch(JAPANESE);
    expect(out).toContain(String(DEFAULT_BATTLE_RULES.keywordValues.executeThresholdPct));
  });

  it("le détail d'une carte écrit chaque capacité avec ses chiffres", () => {
    const rules = setupOf([fighter()], [fighter()]).rules;
    for (const keyword of KEYWORDS) {
      for (const technique of TECHNIQUES) {
        const card = fighter({ keywords: [keyword], technique });
        const out = render(locale, createElement(CardDetail, { card, hp: 100, maxHp: 200, rules }));
        expect(out).toContain(battle.keywords[keyword].name);
        expect(out).toContain(battle.techniques[technique].name);
        expect(out).not.toMatch(/\{[a-z]+[,}]/);
      }
    }
  });

  it("le cut-in d'un ulti le nomme en toutes lettres, sur le bandeau doré", () => {
    for (const ultimate of ULTIMATES) {
      const setup = setupOf([fighter({ ultimate, name: "Akane" }), fighter(), fighter()], [fighter(), fighter(), fighter()]);
      const out = render(locale, createElement(CutIn, { cutin: { id: 1, actor: { side: 0, index: 0 }, ultimate, full: true, ms: 1_400 }, setup, mySide: 0 }));
      expect(out).toContain(`>${battle.ultimates[ultimate].name}</b>`);
      expect(out).toContain("data-ult");
      expect(out).toContain(battle.board.ultimateKicker);
      expect(out).not.toMatch(JAPANESE);
    }
  });

  it("la 4e tablette nomme l'ulti, seulement quand la carte en a un, et s'arme avant de lancer", () => {
    const tablets = (ultimate: Parameters<typeof Tablets>[0]["ultimate"]) =>
      render(
        locale,
        createElement(Tablets, {
          mode: "ATTACK",
          attack: { enabled: true, onPress: noop },
          technique: { technique: "ISSEN", cost: 2, enabled: true, onPress: noop },
          ultimate,
          end: { enabled: true, pulse: false, onPress: noop },
        }),
      );
    expect(tablets(undefined)).toContain('data-count="3"');
    expect(tablets({ ultimate: null, charge: 0, used: false, enabled: false, armed: false, onPress: noop })).not.toContain("tablet-ult");
    for (const ultimate of ULTIMATES) {
      const name = battle.ultimates[ultimate].name;
      const charging = tablets({ ultimate, charge: 50, used: false, enabled: false, armed: false, onPress: noop });
      expect(charging).toContain('data-count="4"');
      expect(charging).toContain(name);
      expect(charging).toContain(html(battle.board.ultimateCharging.replace("{name}", name).replace("{pct}", "50")));
      expect(charging).toContain("tablet-gauge");
      const armed = tablets({ ultimate, charge: 100, used: false, enabled: true, armed: true, onPress: noop });
      expect(armed).toContain("data-armed");
      expect(armed).toContain(html(battle.board.ultimateConfirm.replace("{name}", name)));
      const withoutIcons = Object.values(ACTION_KANJI).reduce((h, icon) => h.replaceAll(icon, ""), armed);
      expect(withoutIcons).not.toMatch(JAPANESE);
    }
  });

  it("la carte porte sa jauge d'ulti, son halo une fois pleine, et la nomme aux lecteurs d'écran", () => {
    const setup = setupOf([fighter({ ultimate: "FUDO" }), fighter(), fighter()], [fighter(), fighter(), fighter()]);
    const base = createState(setup).state.fighters[0][0];
    const props = { slot: { side: 0, index: 0 }, card: setup.teams[0][0], atkBonus: 0, face: "front", numbers: [], register: noop, sizes: "100px" } as const;
    const name = battle.ultimates.FUDO.name;
    const half = render(locale, createElement(StageCard, { ...props, state: { ...base, charge: 40 } }));
    expect(half).toContain('class="stage-ult"');
    expect(half).toContain("scaleX(0.4)");
    expect(half).not.toContain("st-ult-halo");
    expect(half).toContain(html(battle.board.ultimateGauge.replace("{name}", name).replace("{pct}", "40")));
    const full = render(locale, createElement(StageCard, { ...props, state: { ...base, charge: 100 } }));
    expect(full).toContain("st-ult-halo");
    expect(full).toContain(html(battle.board.ultimateFull.replace("{name}", name)));
    const spent = render(locale, createElement(StageCard, { ...props, state: { ...base, charge: 0, ultUsed: true } }));
    expect(spent).not.toContain("stage-ult");
    expect(spent).toContain(html(battle.board.ultimateSpent.replace("{name}", name)));
    expect(full).not.toMatch(JAPANESE);
  });

  it("une carte à terre ne se touche que comme cible de Résurrection", () => {
    const setup = setupOf([fighter(), fighter(), fighter()], [fighter(), fighter(), fighter()]);
    const dead = { ...createState(setup).state.fighters[0][1], hp: 0 };
    const props = { slot: { side: 0, index: 1 }, card: setup.teams[0][1], atkBonus: 0, face: "front", numbers: [], register: noop, sizes: "100px", onPress: noop, state: dead } as const;
    expect(render(locale, createElement(StageCard, props))).toContain('aria-disabled="true"');
    const target = render(locale, createElement(StageCard, { ...props, targetable: true }));
    expect(target).toContain('aria-disabled="false"');
    expect(target).toContain(html(battle.board.raiseTarget));
  });

  it("le détail d'une carte décrit son ulti et la règle de charge", () => {
    const rules = setupOf([fighter()], [fighter()]).rules;
    for (const ultimate of ULTIMATES) {
      const out = render(locale, createElement(CardDetail, { card: fighter({ ultimate }), hp: 100, maxHp: 200, rules }));
      expect(out).toContain(battle.ultimates[ultimate].name);
      expect(out).not.toMatch(/\{[a-z]+[,}]/);
    }
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
