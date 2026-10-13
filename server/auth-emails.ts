import "server-only";
import { getTranslations } from "next-intl/server";
import type { AuthTokenType } from "@/generated/prisma/client";
import { getPathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { createToken, TOKEN_TTL_MS } from "@/lib/auth/tokens";
import { prisma } from "./db";
import { appUrl } from "./env";
import { sendMail } from "./mail";

const PATHS = { VERIFY_EMAIL: "/verifier-email", RESET_PASSWORD: "/connexion/reinitialiser" } as const;

/** Crée un jeton à usage unique (les précédents du même type sont annulés) et renvoie son lien. */
async function issueLink(userId: string, type: AuthTokenType, locale: Locale) {
  const { token, tokenHash } = createToken();
  await prisma.$transaction([
    prisma.authToken.updateMany({
      where: { userId, type, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.authToken.create({
      data: { userId, type, tokenHash, expires: new Date(Date.now() + TOKEN_TTL_MS[type]) },
    }),
  ]);
  const path = getPathname({ href: { pathname: PATHS[type], query: { token } }, locale });
  return `${appUrl()}${path}`;
}

export async function sendVerificationEmail(userId: string, email: string, locale: Locale) {
  const [t, link] = await Promise.all([
    getTranslations({ locale, namespace: "email.verify" }),
    issueLink(userId, "VERIFY_EMAIL", locale),
  ]);
  return sendMail({ to: email, subject: t("subject"), text: t("body", { link }) });
}

export async function sendPasswordResetEmail(userId: string, email: string, locale: Locale) {
  const [t, link] = await Promise.all([
    getTranslations({ locale, namespace: "email.reset" }),
    issueLink(userId, "RESET_PASSWORD", locale),
  ]);
  return sendMail({ to: email, subject: t("subject"), text: t("body", { link }) });
}
