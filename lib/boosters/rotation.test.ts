import { describe, expect, it } from "vitest";
import { pickRotating, rotationSelection, rotationWindow, timeZoneOffsetMs, type RotationPin } from "./rotation";

const GENRES = ["isekai", "sport", "mecha", "horreur", "romance", "fantasy", "science-fiction", "tranche-de-vie", "comedie"];
const DEMOS = ["shonen", "seinen", "shojo", "josei"];
const H = 3_600_000;

describe("timeZoneOffsetMs", () => {
  it("donne le décalage du fuseau, heure d'été comprise", () => {
    expect(timeZoneOffsetMs(new Date("2026-01-15T12:00:00Z"), "Europe/Paris")).toBe(1 * H);
    expect(timeZoneOffsetMs(new Date("2026-07-15T12:00:00Z"), "Europe/Paris")).toBe(2 * H);
    expect(timeZoneOffsetMs(new Date("2026-07-15T12:00:00Z"), "UTC")).toBe(0);
  });
});

describe("rotationWindow", () => {
  it("cale les fenêtres de 12 h sur minuit et midi heure du jeu", () => {
    // 15 octobre 2026, 15 h à Paris (UTC+2)
    const w = rotationWindow(new Date("2026-10-15T13:00:00Z"), 12, "Europe/Paris");
    expect(w.startsAt.toISOString()).toBe("2026-10-15T10:00:00.000Z"); // midi à Paris
    expect(w.endsAt.toISOString()).toBe("2026-10-15T22:00:00.000Z"); // minuit à Paris
  });

  it("garde la même fenêtre jusqu'à sa fin, puis passe à la suivante", () => {
    const a = rotationWindow(new Date("2026-10-15T10:00:00Z"), 12, "Europe/Paris");
    const b = rotationWindow(new Date("2026-10-15T21:59:59Z"), 12, "Europe/Paris");
    const c = rotationWindow(new Date("2026-10-15T22:00:00Z"), 12, "Europe/Paris");
    expect(b.index).toBe(a.index);
    expect(c.index).toBe(a.index + 1);
  });
});

describe("pickRotating", () => {
  it("tire le nombre demandé, sans doublon, dans l'ordre des candidats", () => {
    const picked = pickRotating(GENRES, 4, "genre:100");
    expect(picked).toHaveLength(4);
    expect(new Set(picked).size).toBe(4);
    expect(picked).toEqual(GENRES.filter((g) => picked.includes(g)));
  });

  it("est déterministe : même graine, même sélection, quel que soit l'ordre d'entrée", () => {
    expect(pickRotating(GENRES, 4, "genre:100")).toEqual(pickRotating(GENRES, 4, "genre:100"));
    expect(new Set(pickRotating([...GENRES].reverse(), 4, "genre:100"))).toEqual(new Set(pickRotating(GENRES, 4, "genre:100")));
  });

  it("change d'une fenêtre à l'autre", () => {
    const sets = new Set(Array.from({ length: 20 }, (_, i) => pickRotating(GENRES, 4, `genre:${i}`).join(",")));
    expect(sets.size).toBeGreaterThan(10);
  });

  it("donne tout quand il y a moins de candidats que demandé, rien pour 0", () => {
    expect(pickRotating(["a", "b"], 4, "x")).toEqual(["a", "b"]);
    expect(pickRotating(GENRES, 0, "x")).toEqual([]);
  });
});

describe("rotationSelection", () => {
  const base = {
    candidates: { demographie: DEMOS, genre: GENRES },
    counts: { demographie: 2, genre: 4 },
    window: 42,
    hours: 12,
  };

  it("tire 2 démographies et 4 genres sans épingle", () => {
    const sel = rotationSelection({ ...base, pin: null });
    expect(sel.demographie.slugs).toHaveLength(2);
    expect(sel.genre.slugs).toHaveLength(4);
    expect(sel.demographie.pinned).toBe(false);
  });

  it("applique l'épingle de l'admin pendant sa fenêtre seulement", () => {
    const pin: RotationPin = { window: 42, hours: 12, picks: { genre: ["mecha", "isekai", "comedie"] } };
    const now = rotationSelection({ ...base, pin });
    expect(now.genre).toEqual({ slugs: ["isekai", "mecha", "comedie"], pinned: true });
    // La démographie n'est pas épinglée : le hasard continue
    expect(now.demographie).toEqual(rotationSelection({ ...base, pin: null }).demographie);

    const next = rotationSelection({ ...base, window: 43, pin });
    expect(next.genre.pinned).toBe(false);
    expect(next.genre.slugs).toHaveLength(4);
  });

  it("ignore une épingle posée avec une autre durée de fenêtre", () => {
    const pin: RotationPin = { window: 42, hours: 6, picks: { genre: ["mecha"] } };
    expect(rotationSelection({ ...base, pin }).genre.pinned).toBe(false);
  });

  it("écarte les types épinglés devenus indisponibles, et reprend le hasard s'il n'en reste aucun", () => {
    const pin: RotationPin = { window: 42, hours: 12, picks: { genre: ["mecha", "disparu"], demographie: ["disparu"] } };
    const sel = rotationSelection({ ...base, pin });
    expect(sel.genre).toEqual({ slugs: ["mecha"], pinned: true });
    expect(sel.demographie.pinned).toBe(false);
    expect(sel.demographie.slugs).toHaveLength(2);
  });
});
