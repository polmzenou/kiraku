import { describe, expect, it } from "vitest";
import { dateRange, logQuery, parseAdminLogParams } from "./logs";

describe("filtres du journal admin", () => {
  it("garde les filtres valides et normalise l'action", () => {
    expect(parseAdminLogParams({ action: "setting_update", type: "GameSetting", target: "booster.rates", admin: "Kaito" })).toEqual({
      action: "SETTING_UPDATE",
      type: "GameSetting",
      target: "booster.rates",
      admin: "Kaito",
    });
  });

  it("ignore ce qui est invalide sans faire tomber le reste", () => {
    const p = parseAdminLogParams({ action: "DROP TABLE;", type: "Game Setting", from: "2026-13-45", to: "2026-10-16", cursor: "' OR 1=1" });
    expect(p).toEqual({ to: "2026-10-16" });
  });

  it("prend la première valeur d'un paramètre répété", () => {
    expect(parseAdminLogParams({ action: ["USER_BAN", "USER_COINS"] }).action).toBe("USER_BAN");
  });

  it("bornes de dates inclusives, en UTC", () => {
    expect(dateRange({ from: "2026-10-01", to: "2026-10-16" })).toEqual({
      gte: new Date("2026-10-01T00:00:00Z"),
      lt: new Date("2026-10-17T00:00:00Z"),
    });
    expect(dateRange({})).toEqual({});
  });

  it("conserve les filtres dans les liens de pagination", () => {
    expect(logQuery({ action: "USER_BAN", from: "2026-10-01" }, "clx1")).toEqual({ action: "USER_BAN", from: "2026-10-01", cursor: "clx1" });
  });
});
