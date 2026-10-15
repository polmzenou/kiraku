import type { FieldErrorCode } from "./schemas";

// État renvoyé par les Server Actions des formulaires de compte (useActionState).
export const FORM_ERROR_CODES = [
  "rateLimited",
  "alreadyRegistered",
  "emailTaken",
  "usernameTaken",
  "invalidCredentials",
  "banned",
  "tokenInvalid",
  "tooFast",
  "formExpired",
  "unexpected",
] as const;
export type FormErrorCode = (typeof FORM_ERROR_CODES)[number];

export type FormState = {
  error?: FormErrorCode;
  fields?: Partial<Record<string, FieldErrorCode>>;
  done?: boolean; // action réussie sans redirection (ex. e-mail envoyé)
  mailNotSent?: boolean; // envoi d'e-mails pas encore configuré (Resend en attente)
  // Valeurs réaffichées après une erreur (React vide le formulaire) ; jamais de mot de passe
  values?: { username?: string; email?: string };
};

/** Recopie un champ texte du formulaire pour le réafficher, borné en longueur. */
export function echo(formData: FormData, name: string, max = 254): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value.slice(0, max) : undefined;
}

export const initialFormState: FormState = {};
