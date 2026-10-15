import { z } from "zod";
import { USERNAME_REGEX } from "../username";
import { passwordProblem } from "./password-policy";

// Les messages sont des codes, traduits côté interface (auth.fieldErrors.*).
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128; // borne haute : argon2 sur un texte énorme = déni de service

const email = z
  .string("required")
  .trim()
  .toLowerCase()
  .min(1, "required")
  .max(254, "emailFormat")
  .pipe(z.email("emailFormat"));

const newPassword = z
  .string("required")
  .min(PASSWORD_MIN, "passwordTooShort")
  .max(PASSWORD_MAX, "passwordTooLong");

export const registerSchema = z
  .object({
    username: z.string("required").trim().regex(USERNAME_REGEX, "usernameFormat"),
    email,
    password: newPassword,
    passwordConfirm: z.string("required"),
  })
  .refine((d) => d.password === d.passwordConfirm, {
    path: ["passwordConfirm"],
    message: "passwordMismatch",
  })
  // Ni mot de passe courant, ni pseudo ou e-mail dedans, ni suite prévisible
  .superRefine((d, ctx) => {
    const problem = passwordProblem(d.password, { username: d.username, email: d.email });
    if (problem) ctx.addIssue({ code: "custom", path: ["password"], message: problem });
  });

export const loginSchema = z.object({
  email,
  password: z.string("required").min(1, "required").max(PASSWORD_MAX, "passwordTooLong"),
});

export const resetRequestSchema = z.object({ email });

// Jeton : 32 octets en base64url = 43 caractères
export const tokenSchema = z.string("required").regex(/^[A-Za-z0-9_-]{43}$/, "tokenInvalid");

export const resetPasswordSchema = z
  .object({
    token: tokenSchema,
    password: newPassword,
    passwordConfirm: z.string("required"),
  })
  .refine((d) => d.password === d.passwordConfirm, {
    path: ["passwordConfirm"],
    message: "passwordMismatch",
  })
  .superRefine((d, ctx) => {
    const problem = passwordProblem(d.password);
    if (problem) ctx.addIssue({ code: "custom", path: ["password"], message: problem });
  });

export const FIELD_ERROR_CODES = [
  "required",
  "usernameFormat",
  "emailFormat",
  "passwordTooShort",
  "passwordTooLong",
  "passwordMismatch",
  "passwordCommon",
  "passwordPersonal",
  "passwordWeak",
  "tokenInvalid",
] as const;
export type FieldErrorCode = (typeof FIELD_ERROR_CODES)[number];

/** Première erreur de chaque champ, sous forme de code connu. */
export function fieldErrors(error: z.ZodError): Record<string, FieldErrorCode> {
  const out: Record<string, FieldErrorCode> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    if (out[field]) continue;
    out[field] = (FIELD_ERROR_CODES as readonly string[]).includes(issue.message)
      ? (issue.message as FieldErrorCode)
      : "required";
  }
  return out;
}
