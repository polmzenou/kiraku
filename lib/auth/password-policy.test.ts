import { describe, expect, it } from "vitest";
import { passwordProblem, passwordStrength } from "./password-policy";

describe("règles du mot de passe", () => {
  it("accepte un mot de passe personnel", () => {
    expect(passwordProblem("tasse-de-the-vert-42")).toBeNull();
    expect(passwordProblem("Kumo.ga.ooi.7")).toBeNull();
  });

  it("refuse les mots de passe courants, même avec une fin de symboles ou des majuscules", () => {
    expect(passwordProblem("1234567890")).toBe("passwordCommon");
    expect(passwordProblem("Azertyuiop")).toBe("passwordCommon");
    expect(passwordProblem("naruto1234!!")).toBe("passwordCommon");
    expect(passwordProblem("MotDePasse")).toBe("passwordCommon");
  });

  it("refuse le pseudo ou le début de l'e-mail", () => {
    expect(passwordProblem("monpseudoKata99", { username: "Kata" })).toBe("passwordPersonal");
    expect(passwordProblem("xx-paul.mehr-xx", { email: "paul.mehr@example.com" })).toBe("passwordPersonal");
    // Un pseudo de 2 lettres est trop court pour juger
    expect(passwordProblem("le-ka-du-soir", { username: "ka" })).toBeNull();
  });

  it("refuse les suites prévisibles", () => {
    expect(passwordProblem("abababababab")).toBe("passwordWeak");
    expect(passwordProblem("zzzzzzzzzzz1")).toBe("passwordWeak");
    expect(passwordProblem("klmnopqrstuv")).toBe("passwordWeak");
    expect(passwordProblem("9876543210")).toBe("passwordWeak");
  });
});

describe("jauge de solidité", () => {
  it("vaut 0 vide ou très court, 1 trop court ou refusé", () => {
    expect(passwordStrength("")).toBe(0);
    expect(passwordStrength("abc")).toBe(0);
    expect(passwordStrength("abcdefg")).toBe(1);
    expect(passwordStrength("1234567890")).toBe(1);
  });

  it("monte avec la longueur et la variété", () => {
    expect(passwordStrength("thevertsoir")).toBe(2);
    expect(passwordStrength("Thevert-soir")).toBe(3);
    expect(passwordStrength("Tasse-de-the-42")).toBe(4);
  });
});
