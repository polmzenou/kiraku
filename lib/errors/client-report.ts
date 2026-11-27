import { z } from "@/lib/zod";

// Erreurs du navigateur remontées dans les logs du serveur (app/api/client-error/route.ts). Sans elles, un
// plantage chez un joueur ne laisse aucune trace : la page d'erreur ne l'écrit que dans la console de son
// navigateur. Rapport borné, sans donnée personnelle : nom et message de l'erreur, début de la pile, chemin.

export const CLIENT_ERROR_PATH = "/api/client-error";

const LIMITS = { name: 80, message: 1_000, digest: 64, stack: 3_000, path: 300 } as const;

export const clientErrorSchema = z
  .object({
    boundary: z.enum(["page", "global"]),
    name: z.string().max(LIMITS.name),
    message: z.string().max(LIMITS.message),
    digest: z.string().max(LIMITS.digest).optional(),
    stack: z.string().max(LIMITS.stack).optional(),
    path: z.string().max(LIMITS.path),
  })
  .strict();

export type ClientErrorReport = z.infer<typeof clientErrorSchema>;

/**
 * Texte venu du navigateur (donc falsifiable), prêt pour une ligne des logs du serveur : sans caractère de contrôle
 * (C0, DEL et C1, dont le CSI U+009B que certains terminaux interprètent en lisant pm2 logs) ni séparateur de ligne
 * Unicode, pour qu'un faux rapport ne puisse ni imiter une autre ligne ni piloter le terminal qui les affiche.
 */
export function logLine(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f-\u009f\p{Zl}\p{Zp}]+/gu, " ");
}

const clip = (value: unknown, max: number) => String(value ?? "").slice(0, max);

/** Rapport d'une erreur attrapée par une page d'erreur, coupé aux limites du schéma. */
export function clientErrorReport(error: unknown, path: string, boundary: ClientErrorReport["boundary"]): ClientErrorReport {
  const e = (typeof error === "object" && error !== null ? error : { message: error }) as { name?: unknown; message?: unknown; digest?: unknown; stack?: unknown };
  return {
    boundary,
    name: clip(e.name ?? "Error", LIMITS.name),
    message: clip(e.message, LIMITS.message),
    ...(e.digest ? { digest: clip(e.digest, LIMITS.digest) } : {}),
    ...(e.stack ? { stack: clip(e.stack, LIMITS.stack) } : {}),
    path: clip(path, LIMITS.path),
  };
}

/** Envoie le rapport sans retarder la page (sendBeacon, sinon fetch keepalive). Ne lève jamais. */
export function sendClientError(report: ClientErrorReport): void {
  try {
    const body = JSON.stringify(report);
    if (navigator.sendBeacon?.(CLIENT_ERROR_PATH, new Blob([body], { type: "application/json" }))) return;
    void fetch(CLIENT_ERROR_PATH, { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
  } catch {
    // Navigateur trop ancien ou requête refusée : la page d'erreur reste affichée, rien de plus
  }
}
