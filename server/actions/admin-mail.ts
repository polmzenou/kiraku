"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { z } from "@/lib/zod";
import { getAdmin } from "../admin";
import { sendMail } from "../mail";
import { rateLimit } from "../ratelimit";

// E-mail de test depuis /admin/general : vérifie l'envoi avec l'environnement réellement chargé par le serveur.
// Rôle admin → Zod → rate limit → envoi. Le résultat donne la raison exacte d'un refus de Resend.

export type MailTestResult =
  | { ok: true }
  | { ok: false; error: "FORBIDDEN" | "INVALID" | "RATE_LIMITED" }
  | { ok: false; error: "MAIL"; reason: "disabled" | "refused" | "unreachable" | "error"; detail?: string };

const schema = z.object({ to: z.string().trim().max(254).pipe(z.email()) }).strict();

export async function adminSendTestMailAction(input: unknown): Promise<MailTestResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`mail-test:${admin.id}`, { limit: 5, windowSeconds: 3600 })).success) return { ok: false, error: "RATE_LIMITED" };

  const t = await getTranslations({ locale: await getLocale(), namespace: "admin.mail" });
  const sent = await sendMail({ to: parsed.data.to, subject: t("testSubject"), text: t("testBody", { name: admin.username }) });
  return sent.ok ? { ok: true } : { ok: false, error: "MAIL", reason: sent.reason, detail: sent.detail };
}
