// Schéma du commentaire facultatif, à part de lib/text/plain.ts : les composants client qui nettoient du
// texte (chat, champ de note) n'embarquent pas Zod dans le bundle commun à toutes les pages.
import { z } from "@/lib/zod";
import { cleanPlainText, NOTE_MAX_LENGTH } from "./plain";

/** Commentaire facultatif : nettoyé côté serveur, null s'il est vide, refusé au-delà de 200 caractères. */
export const noteSchema = z
  .string()
  .max(2_000)
  .optional()
  .transform((v) => cleanPlainText(v ?? ""))
  .refine((v) => v.length <= NOTE_MAX_LENGTH)
  .transform((v) => (v === "" ? null : v));
