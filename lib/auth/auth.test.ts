import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";
import { fieldErrors, loginSchema, registerSchema, resetPasswordSchema, tokenSchema } from "./schemas";
import { createToken, hashToken } from "./tokens";

const valid = {
  username: "Kata_99",
  email: "  Kata@Example.COM ",
  password: "correct-horse-battery",
  passwordConfirm: "correct-horse-battery",
};

describe("registerSchema", () => {
  it("normalise l'e-mail (espaces, minuscules)", () => {
    const parsed = registerSchema.parse(valid);
    expect(parsed.email).toBe("kata@example.com");
  });

  it("renvoie un code par champ invalide", () => {
    const result = registerSchema.safeParse({
      username: "Invité!",
      email: "pas-un-email",
      password: "court",
      passwordConfirm: "autre",
    });
    expect(result.success).toBe(false);
    expect(fieldErrors(result.error!)).toEqual({
      username: "usernameFormat",
      email: "emailFormat",
      password: "passwordTooShort",
      passwordConfirm: "passwordMismatch",
    });
  });

  it("refuse deux mots de passe différents", () => {
    const result = registerSchema.safeParse({ ...valid, passwordConfirm: "autre-chose-encore" });
    expect(fieldErrors(result.error!)).toEqual({ passwordConfirm: "passwordMismatch" });
  });

  it("borne la longueur du mot de passe (argon2 sur un texte énorme)", () => {
    const long = "x".repeat(129);
    const result = registerSchema.safeParse({ ...valid, password: long, passwordConfirm: long });
    expect(fieldErrors(result.error!).password).toBe("passwordTooLong");
  });

  it("signale les champs manquants", () => {
    const result = loginSchema.safeParse({ email: null, password: null });
    expect(fieldErrors(result.error!)).toEqual({ email: "required", password: "required" });
  });
});

describe("jetons", () => {
  it("génère un jeton au format attendu et stocke seulement son hash", () => {
    const { token, tokenHash } = createToken();
    expect(tokenSchema.safeParse(token).success).toBe(true);
    expect(tokenHash).toBe(hashToken(token));
    expect(tokenHash).not.toContain(token);
  });

  it("deux jetons ne se ressemblent pas", () => {
    expect(createToken().token).not.toBe(createToken().token);
  });

  it("refuse un jeton mal formé", () => {
    const result = resetPasswordSchema.safeParse({ token: "abc", password: valid.password, passwordConfirm: valid.password });
    expect(fieldErrors(result.error!).token).toBe("tokenInvalid");
  });
});

describe("mots de passe (argon2id)", () => {
  it("vérifie le bon mot de passe et refuse les autres", async () => {
    const hash = await hashPassword("correct-horse-battery");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "correct-horse-battery")).toBe(true);
    expect(await verifyPassword(hash, "mauvais-mot-de-passe")).toBe(false);
  });

  it("refuse sans hash (compte invité ou Discord) sans lever d'erreur", async () => {
    expect(await verifyPassword(null, "n-importe-quoi")).toBe(false);
  });
});
