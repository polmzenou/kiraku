import { describe, expect, it } from "vitest";
import { snowflakeDate } from "./snowflake";

describe("date d'un identifiant Discord", () => {
  it("lit l'exemple de la documentation de Discord", () => {
    expect(snowflakeDate("175928847299117063")).toEqual(new Date("2016-04-30T11:18:25.796Z"));
  });

  it("refuse ce qui n'est pas un snowflake", () => {
    for (const id of ["", "abc", "1234", "12345678901234567890123", "-175928847299117063", "18446744073709551616"]) {
      expect(snowflakeDate(id), id).toBeNull();
    }
  });
});
