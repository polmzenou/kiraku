import { describe, expect, it } from "vitest";
import {
  ADMIN_REVIEW_MAX_PAGE,
  pageCount,
  parseAdminReviewFilter,
  parseAdminReviewPage,
  replyReviewSchema,
  reviewWhere,
  setReviewHiddenSchema,
  setReviewPinnedSchema,
} from "./reviews";

describe("parseAdminReviewFilter", () => {
  it("garde les filtres connus", () => {
    expect(parseAdminReviewFilter("visible")).toBe("visible");
    expect(parseAdminReviewFilter("hidden")).toBe("hidden");
    expect(parseAdminReviewFilter("pinned")).toBe("pinned");
  });

  it("retombe sur « tous » sinon", () => {
    expect(parseAdminReviewFilter(undefined)).toBe("all");
    expect(parseAdminReviewFilter("HIDDEN")).toBe("all");
    expect(parseAdminReviewFilter(["hidden"])).toBe("all");
  });
});

describe("parseAdminReviewPage", () => {
  it("lit un entier positif", () => {
    expect(parseAdminReviewPage("3")).toBe(3);
  });

  it("refuse le reste et borne la page", () => {
    expect(parseAdminReviewPage(undefined)).toBe(0);
    expect(parseAdminReviewPage("-1")).toBe(0);
    expect(parseAdminReviewPage("1.5")).toBe(0);
    expect(parseAdminReviewPage("abc")).toBe(0);
    expect(parseAdminReviewPage("99999")).toBe(0);
    expect(parseAdminReviewPage("9999")).toBe(ADMIN_REVIEW_MAX_PAGE);
  });
});

describe("reviewWhere", () => {
  it("traduit le filtre en condition", () => {
    expect(reviewWhere("all")).toEqual({});
    expect(reviewWhere("visible")).toEqual({ hidden: false });
    expect(reviewWhere("hidden")).toEqual({ hidden: true });
    expect(reviewWhere("pinned")).toEqual({ pinned: true });
  });
});

describe("pageCount", () => {
  it("compte au moins une page", () => {
    expect(pageCount(0, 20)).toBe(1);
    expect(pageCount(20, 20)).toBe(1);
    expect(pageCount(21, 20)).toBe(2);
  });
});

describe("setReviewHiddenSchema", () => {
  it("accepte un id et un booléen", () => {
    expect(setReviewHiddenSchema.safeParse({ reviewId: "clx123abc", hidden: true }).success).toBe(true);
  });

  it("refuse les champs en trop et les ids bizarres", () => {
    expect(setReviewHiddenSchema.safeParse({ reviewId: "clx123abc", hidden: true, body: "x" }).success).toBe(false);
    expect(setReviewHiddenSchema.safeParse({ reviewId: "a'; --", hidden: true }).success).toBe(false);
    expect(setReviewHiddenSchema.safeParse({ reviewId: "clx123abc", hidden: "true" }).success).toBe(false);
  });
});

describe("setReviewPinnedSchema", () => {
  it("accepte un id et un booléen, rien de plus", () => {
    expect(setReviewPinnedSchema.safeParse({ reviewId: "clx123abc", pinned: true }).success).toBe(true);
    expect(setReviewPinnedSchema.safeParse({ reviewId: "clx123abc", pinned: true, hidden: false }).success).toBe(false);
  });
});

describe("replyReviewSchema", () => {
  it("normalise le texte comme un avis", () => {
    const parsed = replyReviewSchema.parse({ reviewId: "clx123abc", reply: "  Merci !\r\n\n\n\nÀ bientôt\u0007  " });
    expect(parsed.reply).toBe("Merci !\n\nÀ bientôt");
  });

  it("un texte vide retire la réponse", () => {
    expect(replyReviewSchema.parse({ reviewId: "clx123abc", reply: "   \n " }).reply).toBeNull();
  });

  it("refuse une réponse trop longue", () => {
    expect(replyReviewSchema.safeParse({ reviewId: "clx123abc", reply: "a".repeat(1001) }).success).toBe(false);
  });
});
