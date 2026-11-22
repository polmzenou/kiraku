import { describe, expect, it } from "vitest";
import { clientErrorReport, clientErrorSchema } from "./client-report";

describe("rapport d'une erreur du navigateur", () => {
  it("garde le nom, le message, la référence et le début de la pile", () => {
    const error = Object.assign(new TypeError("x is undefined"), { digest: "123456" });
    const report = clientErrorReport(error, "/expedition", "page");
    expect(report).toMatchObject({ boundary: "page", name: "TypeError", message: "x is undefined", digest: "123456", path: "/expedition" });
    expect(report.stack).toContain("TypeError");
    expect(clientErrorSchema.safeParse(report).success).toBe(true);
  });

  it("coupe ce qui dépasse, pour rester valide", () => {
    const error = { name: "N".repeat(500), message: "m".repeat(10_000), stack: "s".repeat(20_000) };
    const report = clientErrorReport(error, `/${"p".repeat(1_000)}`, "global");
    expect(clientErrorSchema.safeParse(report).success).toBe(true);
    expect(report.message).toHaveLength(1_000);
  });

  it("accepte une valeur qui n'est pas une Error", () => {
    expect(clientErrorReport("chaîne lancée", "/", "page")).toMatchObject({ name: "Error", message: "chaîne lancée" });
    expect(clientErrorReport(null, "/", "page")).toMatchObject({ name: "Error", message: "" });
  });

  it("refuse un champ en trop", () => {
    expect(clientErrorSchema.safeParse({ ...clientErrorReport(new Error("e"), "/", "page"), email: "a@b.c" }).success).toBe(false);
  });
});
