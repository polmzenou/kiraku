import { expect, it } from "vitest";
import { playBotGames } from "./bot-games";

// Robustesse, tranche 1/2 des 2 000 parties bot contre bot (fichier à part : les tranches tournent en parallèle).
it("parties 0 à 999 : aucune exception, toujours terminées dans la limite de tours", () => {
  expect(playBotGames(0, 1000)).toBe(1_000);
}, 120_000);
