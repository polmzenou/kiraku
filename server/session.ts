import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./db";
import { isProduction } from "./env";

// Sessions en base partagées avec Auth.js : invités et comptes e-mail les créent
// ici, Auth.js (Discord) les crée lui-même ; toutes vivent dans la table Session
// et dans le même cookie.

export const SESSION_MAX_AGE = 90 * 24 * 60 * 60; // 90 jours, prolongée à l'usage

export const SESSION_COOKIE = {
  name: isProduction ? "__Secure-kiraku.session" : "kiraku.session",
  options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: isProduction },
};

type Db = Prisma.TransactionClient | typeof prisma;

/** Crée une session en base pour ce joueur (à poser ensuite avec setSessionCookie). */
export async function createSessionRow(db: Db, userId: string) {
  const sessionToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_MAX_AGE * 1000);
  await db.session.create({ data: { sessionToken, userId, expires } });
  return { sessionToken, expires };
}

export async function setSessionCookie(session: { sessionToken: string; expires: Date }) {
  (await cookies()).set(SESSION_COOKIE.name, session.sessionToken, {
    ...SESSION_COOKIE.options,
    expires: session.expires,
  });
}

/** Supprime la session de cet appareil (ligne en base et cookie). */
export async function destroyCurrentSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE.name)?.value;
  if (token) await prisma.session.deleteMany({ where: { sessionToken: token } });
  jar.delete(SESSION_COOKIE.name);
}

/**
 * Ouvre une nouvelle session pour ce joueur en remplaçant celle de l'appareil
 * (nouveau jeton à chaque changement d'identité : pas de fixation de session).
 */
export async function startSession(userId: string) {
  await destroyCurrentSession();
  await setSessionCookie(await createSessionRow(prisma, userId));
}
