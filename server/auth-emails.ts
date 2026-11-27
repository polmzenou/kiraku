import "server-only";
import { getTranslations } from "next-intl/server";
import type { AuthTokenType } from "@/generated/prisma/client";
import { getPathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { createToken, TOKEN_TTL_MS } from "@/lib/auth/tokens";
import { prisma } from "./db";
import { appUrl } from "./env";
import { type MailResult, sendMail } from "./mail";

const PATHS = { VERIFY_EMAIL: "/verifier-email", RESET_PASSWORD: "/connexion/reinitialiser" } as const;

const NAMESPACES = { VERIFY_EMAIL: "email.verify", RESET_PASSWORD: "email.reset" } as const;

/**
 * Crée un jeton à usage unique, envoie son lien, puis annule les précédents du même type, seulement
 * si l'e-mail est parti : un envoi raté laisse valide le dernier lien reçu par le joueur.
 * Ne lève jamais (renvoie un échec) : l'inscription ou l'action sur le compte continue sans e-mail.
 */
async function sendLink(userId: string, email: string, type: AuthTokenType, locale: Locale): Promise<MailResult> {
  try {
    const { token, tokenHash } = createToken();
    const [t, created] = await Promise.all([
      getTranslations({ locale, namespace: NAMESPACES[type] }),
      prisma.authToken.create({
        data: { userId, type, tokenHash, expires: new Date(Date.now() + TOKEN_TTL_MS[type]) },
        select: { id: true, createdAt: true },
      }),
    ]);
    const path = getPathname({ href: { pathname: PATHS[type], query: { token } }, locale });
    const sent = await sendMail({ to: email, subject: t("subject"), text: t("body", { link: `${appUrl()}${path}` }) });
    if (sent.ok) {
      // Seulement les liens plus anciens que celui-ci : deux envois simultanés (deux onglets) annulaient chacun le
      // jeton de l'autre, et aucun des deux e-mails reçus ne marchait. Le plus récent reste valide.
      await prisma.authToken.updateMany({
        where: { userId, type, usedAt: null, createdAt: { lt: created.createdAt } },
        data: { usedAt: new Date() },
      });
    }
    return sent;
  } catch (e) {
    console.error(`[mail] lien ${type} non envoyé`, e instanceof Error ? e.message : e);
    return { ok: false, reason: "error" };
  }
}

export function sendVerificationEmail(userId: string, email: string, locale: Locale) {
  return sendLink(userId, email, "VERIFY_EMAIL", locale);
}

export function sendPasswordResetEmail(userId: string, email: string, locale: Locale) {
  return sendLink(userId, email, "RESET_PASSWORD", locale);
}
