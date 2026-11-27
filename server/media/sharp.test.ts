import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { loadSharp } from "./sharp";

it("règle sharp pour un petit serveur : sans cache d'opérations, un thread par image", async () => {
  const sharp = await loadSharp();
  expect(sharp).not.toBeNull();
  expect(sharp!.concurrency()).toBe(1);
  const cache = sharp!.cache();
  expect(cache.memory.max).toBe(0);
  expect(cache.items.max).toBe(0);
  // Chargé et réglé une seule fois
  expect(await loadSharp()).toBe(sharp);
}, 30_000);
