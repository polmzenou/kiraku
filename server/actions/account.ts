"use server";

import { getLocale } from "next-intl/server";
import { Prisma } from "@/generated/prisma/client";
import { redirect } from "@/i18n/navigation";
import { echo, type FormState } from "@/lib/auth/form-state";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  fieldErrors,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  resetRequestSchema,
  tokenSchema,
} from "@/lib/auth/schemas";
import { hashToken } from "@/lib/auth/tokens";
import { sendPasswordResetEmail, sendVerificationEmail } from "../auth-emails";
import { prisma } from "../db";
import { mailEnabled } from "../env";
import { attachFromCookie } from "../economy/referral";
import { createPlayer, publishProfileOnSignup, startingValues } from "../players";
import { clientIp, rateLimit } from "../ratelimit";
import { destroyCurrentSession, startSession } from "../session";
import { checkFormGuard } from "../form-guard";
import { currentTermsVersion } from "../legal";
import { getSetting } from "../settings";
import { getCurrentUser } from "../user";

// Formulaires de compte. Ordre des contrôles : session → Zod → propriété → rate limit.
// Connexion, mot de passe oublié et vérification d'e-mail se font par nature sans
// session de compte : ils sont limités par IP (et par e-mail quand il y en a un).

const HOUR = 3600;

function isUniqueViolation(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/** Crée un compte e-mail + mot de passe ; un invité garde sa progression (même User). */
export async function register(_prev: FormState, formData: FormData): Promise<FormState> {
  const current = await getCurrentUser();
  if (current && !current.isGuest) return { error: "alreadyRegistered" };
  const values = { username: echo(formData, "username", 20), email: echo(formData, "email") };

  const parsed = registerSchema.safeParse({
    username: formData.get("username"),
    email: formData.get("email"),
    password: formData.get("password"),
    passwordConfirm: formData.get("passwordConfirm"),
    terms: formData.get("terms"),
  });
  // Robots : jeton signé de la page (délai minimal de remplissage) et champ piège
  const guard = checkFormGuard(formData, "register");
  if (guard === "tooFast") return { error: "tooFast", values };
  if (guard !== "ok") return { error: "formExpired", values };

  if (!parsed.success) return { fields: fieldErrors(parsed.error), values };
  const { username, email, password } = parsed.data;

  // Par IP, et par e-mail : on ne teste pas des adresses en série depuis plusieurs IP
  const [byIp, byEmail] = await Promise.all([
    rateLimit(`register:${await clientIp()}`, { limit: 5, windowSeconds: HOUR }),
    rateLimit(`register:email:${email}`, { limit: 3, windowSeconds: HOUR }),
  ]);
  if (!byIp.success || !byEmail.success) return { error: "rateLimited", values };

  const passwordHash = await hashPassword(password);
  const start = current ? null : await startingValues();
  // Version des CGU acceptée par la case cochée, écrite avec le compte
  const termsVersion = await currentTermsVersion(await getSetting("legal.termsRequiredVersion"));
  let userId: string;
  try {
    userId = await prisma.$transaction(async (tx) => {
      const [usernameTaken, emailTaken] = await Promise.all([
        tx.user.findFirst({
          where: { username: { equals: username, mode: "insensitive" }, NOT: { id: current?.id ?? "" } },
          select: { id: true },
        }),
        tx.user.findUnique({ where: { email }, select: { id: true } }),
      ]);
      if (usernameTaken) throw new FormError("usernameTaken");
      if (emailTaken) throw new FormError("emailTaken");

      if (current) {
        const upgraded = await tx.user.updateMany({
          where: { id: current.id, isGuest: true },
          data: { username, email, passwordHash, isGuest: false, termsVersion },
        });
        if (upgraded.count !== 1) throw new FormError("alreadyRegistered");
        await publishProfileOnSignup(tx, current.id);
        return current.id;
      }
      const user = await createPlayer(tx, { username, email, passwordHash, isGuest: false, termsVersion }, start!);
      return user.id;
    });
  } catch (e) {
    if (e instanceof FormError) return { error: e.code, values };
    if (isUniqueViolation(e)) return { error: "emailTaken", values };
    throw e;
  }

  const locale = await getLocale();
  await startSession(userId);
  // Lien d'invitation suivi avant l'inscription : rattaché maintenant, sans jamais bloquer
  await attachFromCookie(userId);
  await sendVerificationEmail(userId, email, locale);
  redirect({ href: "/", locale });
  return {};
}

/** Connexion e-mail + mot de passe. La session invitée de l'appareil est remplacée. */
export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  const values = { email: echo(formData, "email") };
  if (!parsed.success) return { fields: fieldErrors(parsed.error), values };
  const { email, password } = parsed.data;

  const [byIp, byEmail] = await Promise.all([
    rateLimit(`login:ip:${await clientIp()}`, { limit: 20, windowSeconds: 15 * 60 }),
    rateLimit(`login:email:${email}`, { limit: 5, windowSeconds: 15 * 60 }),
  ]);
  if (!byIp.success || !byEmail.success) return { error: "rateLimited", values };

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, bannedAt: true },
  });
  const valid = await verifyPassword(user?.passwordHash ?? null, password);
  if (!user || !valid) return { error: "invalidCredentials", values };
  if (user.bannedAt) return { error: "banned", values };

  await startSession(user.id);
  redirect({ href: "/", locale: await getLocale() });
  return {};
}

export async function logout(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await destroyCurrentSession();
  redirect({ href: "/connexion", locale: await getLocale() });
}

/** Demande de réinitialisation : même réponse que le compte existe ou non. */
export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetRequestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { fields: fieldErrors(parsed.error), values: { email: echo(formData, "email") } };
  const { email } = parsed.data;

  const [byIp, byEmail] = await Promise.all([
    rateLimit(`reset:ip:${await clientIp()}`, { limit: 5, windowSeconds: HOUR }),
    rateLimit(`reset:email:${email}`, { limit: 3, windowSeconds: HOUR }),
  ]);
  if (!byIp.success || !byEmail.success) return { error: "rateLimited" };

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, bannedAt: true },
  });
  if (user?.passwordHash && !user.bannedAt) {
    await sendPasswordResetEmail(user.id, email, await getLocale());
  }
  // mailNotSent dépend de la configuration du site, pas du compte : ne révèle rien
  return { done: true, mailNotSent: !mailEnabled };
}

/** Nouveau mot de passe depuis le lien reçu : déconnecte tous les appareils. */
export async function resetPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    passwordConfirm: formData.get("passwordConfirm"),
  });
  if (!parsed.success) {
    const fields = fieldErrors(parsed.error);
    return fields.token ? { error: "tokenInvalid" } : { fields };
  }

  if (!(await rateLimit(`reset-use:${await clientIp()}`, { limit: 10, windowSeconds: HOUR })).success) {
    return { error: "rateLimited" };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const userId = await prisma.$transaction(async (tx) => {
    const token = await tx.authToken.findUnique({
      where: { tokenHash: hashToken(parsed.data.token) },
      select: { id: true, userId: true, type: true, expires: true, usedAt: true },
    });
    if (!token || token.type !== "RESET_PASSWORD" || token.usedAt || token.expires <= new Date()) return null;
    // Consommation atomique : deux envois simultanés du même lien, un seul passe
    const used = await tx.authToken.updateMany({
      where: { id: token.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (used.count !== 1) return null;
    const user = await tx.user.findUnique({ where: { id: token.userId }, select: { emailVerified: true } });
    await tx.user.update({
      where: { id: token.userId },
      // Le lien reçu prouve aussi l'accès à la boîte mail
      data: { passwordHash, ...(user?.emailVerified ? {} : { emailVerified: new Date() }) },
    });
    await tx.session.deleteMany({ where: { userId: token.userId } });
    return token.userId;
  });
  if (!userId) return { error: "tokenInvalid" };

  await startSession(userId);
  redirect({ href: "/", locale: await getLocale() });
  return {};
}

/** Confirme l'adresse e-mail depuis le lien reçu (pas besoin d'être connecté). */
export async function verifyEmail(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = tokenSchema.safeParse(formData.get("token"));
  if (!parsed.success) return { error: "tokenInvalid" };

  if (!(await rateLimit(`verify:${await clientIp()}`, { limit: 10, windowSeconds: HOUR })).success) {
    return { error: "rateLimited" };
  }

  const ok = await prisma.$transaction(async (tx) => {
    const token = await tx.authToken.findUnique({
      where: { tokenHash: hashToken(parsed.data) },
      select: { id: true, userId: true, type: true, expires: true, usedAt: true },
    });
    if (!token || token.type !== "VERIFY_EMAIL" || token.usedAt || token.expires <= new Date()) return false;
    const used = await tx.authToken.updateMany({
      where: { id: token.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (used.count !== 1) return false;
    await tx.user.update({ where: { id: token.userId }, data: { emailVerified: new Date() } });
    return true;
  });
  return ok ? { done: true } : { error: "tokenInvalid" };
}

/** Renvoie le lien de vérification au joueur connecté. */
export async function resendVerification(): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user?.email || user.emailVerified) return {};

  if (!(await rateLimit(`verify-resend:${user.id}`, { limit: 3, windowSeconds: HOUR })).success) {
    return { error: "rateLimited" };
  }
  const sent = await sendVerificationEmail(user.id, user.email, await getLocale());
  return { done: true, mailNotSent: !sent };
}

class FormError extends Error {
  constructor(readonly code: NonNullable<FormState["error"]>) {
    super(code);
  }
}
