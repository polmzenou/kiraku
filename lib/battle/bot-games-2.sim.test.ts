import { expect, it } from "vitest";
import { playBotGames } from "./bot-games";

// Robustesse, tranche 2/2 des 2 000 parties bot contre bot (fichier à part : les tranches tournent en parallèle).
it("parties 1000 à 1999 : aucune exception, toujours terminées dans la limite de tours", () => {
  expect(playBotGames(1000, 2000)).toBe(1_000);
}, 120_000);
