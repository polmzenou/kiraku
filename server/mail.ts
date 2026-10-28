import "server-only";
import { env, isProduction, mailEnabled } from "./env";

type Mail = { to: string; subject: string; text: string };

const SEND_TIMEOUT_MS = 5_000;

/**
 * Envoie un e-mail en texte brut via l'API HTTP de Resend.
 * Sans RESEND_API_KEY / MAIL_FROM (mode en attente) : en dev, le message est
 * écrit dans les logs du serveur ; en prod, il n'est pas envoyé.
 * Renvoie true si l'e-mail est parti. Ne lève jamais : un refus (4xx, 429 quota, 5xx), une panne
 * réseau ou un délai dépassé sont journalisés et renvoient false, l'action appelante continue.
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  if (!mailEnabled) {
    if (!isProduction) console.info(`[mail en attente] À : ${mail.to}\n${mail.subject}\n\n${mail.text}`);
    else console.warn("[mail] RESEND_API_KEY ou MAIL_FROM manquant : e-mail non envoyé.");
    return false;
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
      console.error(`[mail] échec de l'envoi (${res.status})`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[mail] Resend injoignable", e instanceof Error ? e.message : e);
    return false;
  }
}
