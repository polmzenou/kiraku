import { describe, expect, it } from "vitest";
import { averageRating, canReview, normalizeReviewBody, paginate, pinnedFirst, reviewInputSchema, shuffle, starFill } from "./reviews";

describe("reviewInputSchema", () => {
  it("accepte une note de 1 à 5 et un texte", () => {
    expect(reviewInputSchema.parse({ rating: 5, body: "  super  " })).toEqual({ rating: 5, body: "super" });
  });

  it("refuse une note hors bornes ou non entière", () => {
    for (const rating of [0, 6, 4.5, -1]) expect(reviewInputSchema.safeParse({ rating, body: "ok" }).success).toBe(false);
  });

  it("refuse un texte vide ou trop long", () => {
    expect(reviewInputSchema.safeParse({ rating: 3, body: "   \n " }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ rating: 3, body: "a".repeat(1001) }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ rating: 3, body: "a".repeat(1000) }).success).toBe(true);
  });

  it("refuse les champs inattendus sans les recopier", () => {
    const parsed = reviewInputSchema.parse({ rating: 4, body: "bien", hidden: false, userId: "x" });
    expect(parsed).toEqual({ rating: 4, body: "bien" });
  });
});

describe("normalizeReviewBody", () => {
  it("retire les caractères de contrôle et limite les sauts de ligne", () => {
    expect(normalizeReviewBody("a\u0000b‮c\r\n\r\n\r\n\r\nd")).toBe("abc\n\nd");
  });
});

describe("canReview", () => {
  const base = { isGuest: false, bannedAt: null, role: "USER" };
  it("accepte un compte lié non banni", () => {
    expect(canReview(base)).toBe(true);
    expect(canReview({ ...base, role: "ADMIN" })).toBe(true);
  });
  it("refuse invités, bannis et visiteurs", () => {
    expect(canReview({ ...base, isGuest: true })).toBe(false);
    expect(canReview({ ...base, bannedAt: new Date() })).toBe(false);
    expect(canReview(null)).toBe(false);
  });
});

describe("shuffle", () => {
  it("garde les mêmes éléments sans toucher l'original", () => {
    const items = [1, 2, 3, 4, 5];
    const out = shuffle(items, () => 0);
    expect(out.slice().sort()).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5]);
    expect(out).not.toEqual(items);
  });
});

describe("pinnedFirst", () => {
  it("garde les épinglés en tête dans leur ordre et mélange le reste", () => {
    const items = [
      { id: "a", pinned: false },
      { id: "p1", pinned: true },
      { id: "b", pinned: false },
      { id: "p2", pinned: true },
      { id: "c", pinned: false },
    ];
    const out = pinnedFirst(items, () => 0).map((r) => r.id);
    expect(out.slice(0, 2)).toEqual(["p1", "p2"]);
    expect(out.slice(2).sort()).toEqual(["a", "b", "c"]);
    expect(out.slice(2)).not.toEqual(["a", "b", "c"]);
  });
});

describe("paginate", () => {
  it("découpe et borne le nombre de pages", () => {
    expect(paginate([1, 2, 3, 4, 5], 2, 10)).toEqual([[1, 2], [3, 4], [5]]);
    expect(paginate([1, 2, 3, 4, 5], 2, 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(paginate([], 6, 5)).toEqual([]);
  });
});

describe("notes", () => {
  it("remplit les étoiles selon la moyenne", () => {
    expect([0, 1, 2, 3, 4].map((i) => starFill(4.7, i))).toEqual([1, 1, 1, 1, expect.closeTo(0.7)]);
  });
  it("arrondit la moyenne au dixième", () => {
    expect(averageRating(47, 10)).toBe(4.7);
    expect(averageRating(14, 3)).toBe(4.7);
    expect(averageRating(0, 0)).toBeNull();
  });
});
