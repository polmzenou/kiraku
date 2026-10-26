"use client";

import { useTranslations } from "next-intl";
import { other } from "@/lib/battle/engine";
import type { BattleEvent, BattleSetup, FighterSetup, Side } from "@/lib/battle/types";
import type { PlayerView } from "@/lib/battle/view";
import { usePlayerName } from "./BoardLayout";

/** Journal lisible des derniers événements (colonne de droite sur desktop). */
export function BattleLog({
  feed,
  setup,
  players,
}: {
  feed: readonly { id: number; event: BattleEvent }[];
  setup: BattleSetup;
  players: [PlayerView, PlayerView | null];
}) {
  const t = useTranslations("battle");
  const name = usePlayerName();
  const card = (side: Side, i: number) => setup.teams[side][i]?.name ?? "?";
  const player = (side: Side) => name(players[side]);

  const line = (e: BattleEvent): string | null => {
    switch (e.t) {
      case "turn":
        return t("log.turn", { player: player(e.side) });
      case "attack": {
        if (!e.technique) return t("log.attack", { actor: card(e.side, e.actor), target: card(other(e.side), e.target ?? 0) });
        const technique = t(`techniques.${e.technique}.name`);
        if (e.target === null) return t("log.technique", { actor: card(e.side, e.actor), technique });
        const targetSide = e.technique === "IYASHI" || e.technique === "SHUGO" ? e.side : other(e.side);
        return t("log.techniqueOn", { actor: card(e.side, e.actor), technique, target: card(targetSide, e.target) });
      }
      case "damage":
        return t(e.crit ? "log.crit" : "log.damage", { target: card(e.side, e.index), amount: e.amount });
      case "block":
        return t("log.block", { target: card(e.side, e.index) });
      case "heal":
        return e.amount > 0 ? t("log.heal", { target: card(e.side, e.index), amount: e.amount }) : null;
      case "poisoned":
        return t("log.poisoned", { target: card(e.side, e.index) });
      case "poison":
        return t("log.poison", { target: card(e.side, e.index), amount: e.amount });
      case "riposte":
        return t("log.riposte", { target: card(e.side, e.index) });
      case "ko":
        return t("log.ko", { target: card(e.side, e.index) });
      case "revive":
        return t("log.revive", { target: card(e.side, e.index), hp: e.hp });
      case "barrier":
        return t("log.barrier", { target: card(e.side, e.index) });
      case "buff":
        return t("log.buff", { player: player(e.side), pct: e.pct });
      case "seal":
        return t("log.seal", { target: card(e.side, e.index) });
      case "timeout":
        return t("log.timeout", { player: player(e.side) });
      case "forfeit":
        return t("log.forfeit", { player: player(e.side) });
      default:
        return null;
    }
  };

  const lines = feed.flatMap(({ id, event }) => {
    const text = line(event);
    return text ? [{ id, text, strong: event.t === "turn" || event.t === "ko" || (event.t === "damage" && event.crit) }] : [];
  });

  return (
    <section className="flex flex-col gap-2 lacquer rounded-card p-4">
      <h2 className="font-heading text-base font-bold">{t("log.title")}</h2>
      {lines.length === 0 ? (
        <p className="text-sm text-text-muted">{t("log.empty")}</p>
      ) : (
        <ol className="flex max-h-[420px] flex-col-reverse gap-1 overflow-y-auto text-sm" aria-live="polite">
          {[...lines].reverse().slice(0, 30).map((l) => (
            <li key={l.id} className={l.strong ? "font-bold" : "text-text-muted"}>
              {l.text}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Détail d'une carte : stats, technique et passifs avec leurs effets chiffrés. */
export function CardDetail({ card, hp, maxHp, rules }: { card: FighterSetup | null; hp: number; maxHp: number; rules: BattleSetup["rules"] }) {
  const t = useTranslations("battle");
  if (!card) {
    return (
      <section className="lacquer rounded-card p-4">
        <h2 className="font-heading text-base font-bold">{t("detail.title")}</h2>
        <p className="mt-1 text-sm text-text-muted">{t("detail.hint")}</p>
      </section>
    );
  }
  const tech = rules.techniques[card.technique];
  const k = rules.keywords;
  const kwValues = { pct: 0, turns: k.poisonTurns };
  const kwPct = { TAUNT: 0, BARRIER: 0, FLURRY: 0, POISON: k.poisonPct, RIPOSTE: k.ripostePct, LAST_WILL: k.lastWillHealPct, REVIVE: k.revivePct };
  return (
    <section className="flex flex-col gap-3 lacquer rounded-card p-4">
      <div>
        <h2 className="font-heading text-lg font-bold">{card.name}</h2>
        <p className="text-sm tabular-nums text-text-muted">{t("detail.stats", { atk: card.atk, def: card.def, hp, max: maxHp })}</p>
      </div>
      <div className="flex gap-2">
        <p className="text-sm">
          <strong className="text-shu">{t("board.technique", { name: t(`techniques.${card.technique}.name`), cost: tech.cost })}</strong>
          <br />
          <span className="text-text-muted">{t(`techniques.${card.technique}.desc`, { mult: (tech.value / 100).toLocaleString(), pct: tech.value })}</span>
        </p>
      </div>
      {card.keywords.map((kw) => (
        <div key={kw} className="flex gap-2">
          <p className="text-sm">
            <strong className="text-kin">{t(`keywords.${kw}.name`)}</strong>
            <br />
            <span className="text-text-muted">{t(`keywords.${kw}.desc`, { ...kwValues, pct: kwPct[kw] })}</span>
          </p>
        </div>
      ))}
    </section>
  );
}
