// Taux de victoire de chaque capacité, pour régler les valeurs de lib/settings/defaults.ts. Aucune base requise.
//   npm run battle:balance                 2 500 parties par ligne
//   npm run battle:balance -- --games 500  plus rapide, moins précis
// PowerShell avale le « -- » : y écrire npm run battle:balance '--' --games 500.
import { parseArgs } from "node:util";
import { abilityWinRate, BALANCE_TARGETS } from "../lib/battle/balance.ts";
import { LEGACY_KEYWORDS, LEGACY_TECHNIQUES, NEW_KEYWORDS, NEW_TECHNIQUES } from "../lib/battle/types.ts";

const { values: args } = parseArgs({ options: { games: { type: "string", default: "2500" } } });
const games = Number(args.games);
if (!Number.isInteger(games) || games < 1) {
  console.error("--games doit être un entier positif.");
  process.exit(1);
}

const pct = (rate: number) => `${(rate * 100).toFixed(1).padStart(5)} %`;
function section(title: string, labels: readonly string[], rate: (label: string) => number, target?: { min: number; max: number }) {
  console.log(`\n${title}`);
  for (const label of labels) {
    const r = rate(label);
    const flag = target ? (r < target.min ? "  sous la cible" : r > target.max ? "  au-dessus de la cible" : "  ok") : "";
    console.log(`  ${label.padEnd(10)} ${pct(r)}${flag}`);
  }
}

console.log(`${games} parties par ligne. Cibles : passifs ${BALANCE_TARGETS.keyword.min * 100}-${BALANCE_TARGETS.keyword.max * 100} %, techniques ${BALANCE_TARGETS.technique.min * 100}-${BALANCE_TARGETS.technique.max * 100} %.`);
console.log(`\nRéférence (sans capacité) ${pct(abilityWinRate({}, games))}`);
section("Passifs d'origine", LEGACY_KEYWORDS, (k) => abilityWinRate({ keyword: k as (typeof LEGACY_KEYWORDS)[number] }, games));
section("Nouveaux passifs", NEW_KEYWORDS, (k) => abilityWinRate({ keyword: k as (typeof NEW_KEYWORDS)[number] }, games), BALANCE_TARGETS.keyword);
section("Techniques d'origine, à la place d'Éclair", LEGACY_TECHNIQUES.slice(1), (t) => abilityWinRate({ technique: t as (typeof LEGACY_TECHNIQUES)[number] }, games));
section("Nouvelles techniques, à la place d'Éclair", NEW_TECHNIQUES, (t) => abilityWinRate({ technique: t as (typeof NEW_TECHNIQUES)[number] }, games), BALANCE_TARGETS.technique);
