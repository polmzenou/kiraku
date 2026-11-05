import { expect, it } from "vitest";
import { seededRng } from "@/lib/rng";
import { botGame, randomTeam } from "./bot-games";
import { RULES, setupOf } from "./fixtures";
import type { BattleSetup, Side } from "./types";

// Équilibrage de la synergie : deux équipes identiques, dont une avec le bonus, premier joueur alterné.
// Le bonus par défaut doit se sentir sans décider la partie à lui seul (58,6 % mesurés sur 6 000 parties).
const GAMES = 2_000;

it("le camp en synergie gagne plus souvent, sans écraser un miroir", () => {
  const atkPct = RULES.synergyAtkPct ?? 0;
  const rng = seededRng(4_242);
  let wins = 0;
  let decided = 0;
  for (let i = 0; i < GAMES; i++) {
    const team = randomTeam(rng);
    // Le camp boosté alterne aussi : un éventuel biais de côté ne fausse pas la mesure
    const boosted = (i % 4 < 2 ? 0 : 1) as Side;
    const synergy = { key: "miroir", name: "Miroir", atkPct };
    const setup: BattleSetup = {
      ...setupOf(team, team.map((f) => ({ ...f })), RULES, (i % 2) as Side),
      synergy: boosted === 0 ? [synergy, null] : [null, synergy],
    };
    const { state } = botGame(i, setup);
    if (state.winner === null) continue;
    decided++;
    if (state.winner === boosted) wins++;
  }
  const rate = wins / decided;
  expect(rate).toBeGreaterThan(0.53);
  expect(rate).toBeLessThan(0.65);
}, 120_000);
