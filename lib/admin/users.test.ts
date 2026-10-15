import { describe, expect, it } from "vitest";
import { adjustedValue, adminUserMutationSchema, MAX_ADMIN_VALUE, parseUserListParams } from "./users";
import fr from "@/messages/fr.json";
import en from "@/messages/en.json";

const base = { userId: "player-a", reason: "Correction" };

describe("gestion des joueurs : validation", () => {
  it("autorise un solde nul et un total supérieur au plafond d'un mouvement", () => {
    for (const amount of [0, MAX_ADMIN_VALUE]) expect(adminUserMutationSchema.safeParse({ ...base, kind: "coins", mode: "SET", amount }).success).toBe(true);
  });
  it("refuse montants négatifs, flottants, non finis, chaînes et débordements", () => {
    for (const amount of [-1, 1.5, NaN, Infinity, "100", MAX_ADMIN_VALUE + 1]) expect(adminUserMutationSchema.safeParse({ ...base, kind: "coins", mode: "SET", amount }).success).toBe(false);
  });
  it("borne les mouvements et exige une quantité positive", () => {
    for (const kind of ["coins", "booster"]) {
      const extra = kind === "booster" ? { boosterTypeId: "type-a" } : {};
      for (const mode of ["ADD", "REMOVE"]) {
        for (const amount of [0, 100_000_001]) expect(adminUserMutationSchema.safeParse({ ...base, ...extra, kind, mode, amount }).success).toBe(false);
      }
    }
    expect(adminUserMutationSchema.safeParse({ ...base, kind: "card", cardId: "card-a", mode: "ADD", amount: 1001 }).success).toBe(false);
  });
  it("n'accepte aucun champ de compte ou de sécurité injecté", () => {
    const input = { ...base, kind: "stat", field: "rankPoints", value: 100 };
    expect(adminUserMutationSchema.safeParse({ ...input, role: "ADMIN" }).success).toBe(false);
    expect(adminUserMutationSchema.safeParse({ ...input, field: "passwordHash" }).success).toBe(false);
    expect(adminUserMutationSchema.safeParse({ ...input, userId: "../../a" }).success).toBe(false);
    expect(adminUserMutationSchema.safeParse({ ...input, reason: "  " }).success).toBe(false);
  });
  it("valide les rôles et les pseudonymes", () => {
    const input = { ...base, kind: "account", username: "Player_12", role: "USER", banned: false, profileVisibility: "PRIVATE", showCollection: true };
    expect(adminUserMutationSchema.safeParse(input).success).toBe(true);
    expect(adminUserMutationSchema.safeParse({ ...input, username: "a" }).success).toBe(false);
    expect(adminUserMutationSchema.safeParse({ ...input, role: "OWNER" }).success).toBe(false);
  });
});

describe("ajustements numériques", () => {
  it("définit, ajoute et retire sans passer sous zéro", () => {
    expect(adjustedValue(10, "SET", 0)).toBe(0);
    expect(adjustedValue(10, "ADD", 3)).toBe(13);
    expect(adjustedValue(10, "REMOVE", 10)).toBe(0);
    expect(() => adjustedValue(10, "REMOVE", 11)).toThrow("INSUFFICIENT");
    expect(() => adjustedValue(MAX_ADMIN_VALUE, "ADD", 1)).toThrow("LIMIT");
  });
});

describe("filtres et traductions", () => {
  it("borne la recherche et ignore les paramètres de pagination invalides", () => {
    expect(parseUserListParams({ q: "  abc  ", filter: "banned", page: "12" })).toEqual({ query: "abc", filter: "banned", page: 12 });
    expect(parseUserListParams({ q: ["a"], filter: "unknown", page: "-1" })).toEqual({ query: "", filter: "all", page: 0 });
    expect(parseUserListParams({ q: "a".repeat(500), page: "99999" }).query).toHaveLength(100);
    expect(parseUserListParams({ page: "99999" }).page).toBe(2000);
  });
  it("fournit les mêmes textes en français et en anglais", () => {
    const keys = (obj: object, prefix = ""): string[] => Object.entries(obj).flatMap(([key, value]) => typeof value === "object" ? keys(value, `${prefix}${key}.`) : [`${prefix}${key}`]);
    expect(keys(fr.admin.users).sort()).toEqual(keys(en.admin.users).sort());
  });
});
