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
import { KEYWORDS, TECHNIQUES, ULTIMATES, type BattleEvent, type BattleSetup, type Keyword } from "@/lib/battle/types";
import type { PlayerView } from "@/lib/battle/view";
import { AbilityLists } from "./AbilityGuide";
import { CutIn } from "./fx/CutIn";
import { PlayerBanner, Tablets } from "./hud/Hud";
import { StageCard } from "./stage/StageCard";
import { SynergyFilament } from "./stage/SynergyFilament";
import { useLogLine } from "./useLogLine";

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

  it("le fil des actions a une phrase complète pour chaque événement, noms des cartes et des joueurs compris", () => {
    const setup = setupOf(
      [fighter({ name: "Akane" }), fighter({ name: "Benkei" }), fighter({ name: "Chiyo" })],
      [fighter({ name: "Daigo" }), fighter({ name: "Emi" }), fighter({ name: "Fuyu" })],
    );
    const withSynergy = { ...setup, synergy: [{ key: "u1", name: "Yozakura", atkPct: 10 }, null] as BattleSetup["synergy"] };
    // Un exemple par type d'événement : un type ajouté au moteur sans phrase ici ne compile pas
    const one: { [K in BattleEvent["t"]]: Extract<BattleEvent, { t: K }> } = {
      turn: { t: "turn", side: 0, turn: 3, orbs: 2 },
      attack: { t: "attack", side: 0, actor: 0, target: 1, technique: null },
      ultimate: { t: "ultimate", side: 0, actor: 0, target: null, ultimate: "FUDO" },
      damage: { t: "damage", side: 1, index: 1, amount: 12, crit: false, hp: 30 },
      block: { t: "block", side: 1, index: 0 },
      heal: { t: "heal", side: 0, index: 2, amount: 8, hp: 50 },
      lifesteal: { t: "lifesteal", side: 0, index: 0 },
      orbs: { t: "orbs", side: 1, orbs: 4 },
      poisoned: { t: "poisoned", side: 1, index: 2 },
      poison: { t: "poison", side: 1, index: 2, amount: 5, hp: 20 },
      riposte: { t: "riposte", side: 1, index: 0 },
      ko: { t: "ko", side: 1, index: 1 },
      synergy_break: { t: "synergy_break", side: 0 },
      revive: { t: "revive", side: 1, index: 1, hp: 40 },
      raise: { t: "raise", side: 0, index: 1, hp: 35 },
      barrier: { t: "barrier", side: 0, index: 2 },
      buff: { t: "buff", side: 0, pct: 20 },
      seal: { t: "seal", side: 1, index: 0 },
      timeout: { t: "timeout", side: 1 },
      forfeit: { t: "forfeit", side: 0 },
      end: { t: "end", winner: 0, reason: "KO" },
    };
    const variants: BattleEvent[] = [
      { t: "attack", side: 0, actor: 1, target: null, technique: "SHUGO" },
      { t: "attack", side: 0, actor: 1, target: 2, technique: "IYASHI" },
      { t: "attack", side: 1, actor: 0, target: 0, technique: "ISSEN" },
      { t: "ultimate", side: 0, actor: 2, target: 1, ultimate: "KISHI" },
      { t: "ultimate", side: 1, actor: 0, target: 2, ultimate: "TENCHU" },
      { t: "damage", side: 0, index: 0, amount: 30, crit: true, hp: 10 },
      { t: "block", side: 0, index: 1, pierced: true },
    ];
    const players: [PlayerView, PlayerView | null] = [{ username: "Tristren", image: null, isGuest: false, decor: { frame: null, nameColor: null, prestige: 0 } }, { bot: "ONI" }];
    const lines: (string | null)[] = [];
    function Lines({ events }: { events: BattleEvent[] }) {
      const line = useLogLine(withSynergy, players);
      for (const e of events) lines.push(line(e));
      return null;
    }
    render(locale, createElement(Lines, { events: [...Object.values(one), ...variants] }));
    const said = lines.slice(0, -variants.length);
    // Fin de partie : rien dans le fil (le verdict s'affiche à part)
    expect(said.at(-1)).toBeNull();
    for (const text of [...said.slice(0, -1), ...lines.slice(-variants.length)]) {
      expect(text).toBeTruthy();
      expect(text).not.toMatch(/[{}]|\?/);
      expect(text).toMatch(/Akane|Benkei|Chiyo|Daigo|Emi|Fuyu|Tristren|Oni/);
    }
    // Un soin nul ne dit rien
    lines.length = 0;
    render(locale, createElement(Lines, { events: [{ t: "heal", side: 0, index: 0, amount: 0, hp: 50 }] }));
    expect(lines).toEqual([null]);
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
