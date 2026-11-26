import { describe, expect, it } from "vitest";
import { discordStaffRole, staffRoleIds } from "./staff";

const KIRAKU = "1565773684243697905";

describe("rôles admis dans les salons privés de l'équipe", () => {
  it("garde les rôles d'équipe connus du serveur Kiraku et les rôles de gestion", () => {
    expect(discordStaffRole({ id: "1565774480813334590", permissions: "0" }, KIRAKU)).toBe(true);
    expect(discordStaffRole({ id: "1565774480813334590", permissions: "0" }, "1565700000000000000")).toBe(false);
    expect(discordStaffRole({ id: "1565799999999999999", permissions: String(1n << 13n) }, KIRAKU)).toBe(true);
    expect(discordStaffRole({ id: "1565799999999999999", permissions: "0" }, KIRAKU)).toBe(false);
  });
  it("accepte un rôle de modération ajouté par DISCORD_STAFF_ROLE_IDS", () => {
    const extra = staffRoleIds("1565788888888888888,1565799999999999999");
    expect(extra).toEqual(["1565788888888888888", "1565799999999999999"]);
    expect(discordStaffRole({ id: "1565799999999999999", permissions: "0" }, KIRAKU, extra)).toBe(true);
    expect(staffRoleIds(undefined)).toEqual([]);
  });
});
