import "server-only";
import { env, isProduction, mailEnabled } from "./env";

type Mail = { to: string; subject: string; text: string };

/**
 * Issue d'un envoi. `disabled` : RESEND_API_KEY / MAIL_FROM absents ; `refused` : Resend a répondu une erreur
 * (domaine non vérifié, quota, clé invalide…) ; `unreachable` : panne réseau ou délai dépassé ; `error` : erreur
 * avant l'envoi (base, traductions). `detail` : raison donnée par Resend, pour les journaux et le test de l'admin.
 */
export type MailResult = { ok: true } | { ok: false; reason: "disabled" | "refused" | "unreachable" | "error"; detail?: string };

const SEND_TIMEOUT_MS = 5_000;
const DETAIL_MAX = 300;

/** Raison lisible d'un refus de Resend ({ name, message } en JSON), tronquée ; null si le corps est illisible. */
async function refusalDetail(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { name?: unknown; message?: unknown };
    const parts = [body.name, body.message].filter((part): part is string => typeof part === "string" && part.length > 0);
    return parts.length ? parts.join(" : ").slice(0, DETAIL_MAX) : null;
  } catch {
    return null;
  }
}

/**
 * Envoie un e-mail en texte brut via l'API HTTP de Resend.
 * Sans RESEND_API_KEY / MAIL_FROM (mode en attente) : en dev, le message est
 * écrit dans les logs du serveur ; en prod, il n'est pas envoyé.
 * Ne lève jamais : un refus (4xx, 429 quota, 5xx), une panne réseau ou un délai dépassé sont journalisés,
 * avec la raison donnée par Resend, et renvoyés comme un échec ; l'action appelante continue.
 */
export async function sendMail(mail: Mail): Promise<MailResult> {
  if (!mailEnabled) {
    if (!isProduction) console.info(`[mail en attente] À : ${mail.to}\n${mail.subject}\n\n${mail.text}`);
    else console.warn("[mail] RESEND_API_KEY ou MAIL_FROM manquant : e-mail non envoyé.");
    return { ok: false, reason: "disabled" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = (await refusalDetail(res)) ?? `HTTP ${res.status}`;
      console.error(`[mail] échec de l'envoi (${res.status}) : ${detail}`);
      return { ok: false, reason: "refused", detail };
    }
    return { ok: true };
  } catch (e) {
    const detail = (e instanceof Error ? e.message : String(e)).slice(0, DETAIL_MAX);
    console.error("[mail] Resend injoignable", detail);
    return { ok: false, reason: "unreachable", detail };
  }
}
