"use server";

import { z } from "zod";
import { auth, signIn, signOut } from "../auth";
import { discordEnabled } from "../env";
import { createGuestSession } from "../guest";
import { clientIp, rateLimit } from "../ratelimit";
import { setSessionCookie } from "../session";
import { getSetting } from "../settings";
import { getCurrentUser } from "../user";

type ActionResult = { ok: true } | { ok: false; error: "RATE_LIMITED" };

const internalPath = z
  .string()
  .max(200)
  .regex(/^\/(?![/\\])[^\s\\]*$/);

/** Première visite sans session : crée un compte invité et sa session. */
export async function ensureGuest(): Promise<ActionResult> {
  const session = await auth();
  if (session?.user?.id) return { ok: true };

  const limit = await getSetting("guest.createPerHourPerIp");
  const { success } = await rateLimit(`guest:${await clientIp()}`, { limit, windowSeconds: 3600 });
  if (!success) return { ok: false, error: "RATE_LIMITED" };

  await setSessionCookie(await createGuestSession());
  return { ok: true };
}

/**
 * Lie Discord au joueur connecté (invité ou compte e-mail) : Auth.js rattache
 * le compte OAuth à l'utilisateur de la session courante.
 */
export async function linkDiscord(formData: FormData): Promise<void> {
  if (!discordEnabled) return;
  const user = await getCurrentUser();
  if (!user || user.discordLinkedAt) return;

  const parsed = internalPath.safeParse(formData.get("redirectTo"));

  const { success } = await rateLimit(`auth:${user.id}`, { limit: 10, windowSeconds: 60 });
  if (!success) return;

  await signIn("discord", { redirectTo: parsed.success ? parsed.data : "/" });
}

/**
 * Le compte Discord appartient déjà à un autre joueur : on abandonne la session
 * invitée de cet appareil, puis on se connecte au compte existant.
 */
export async function abandonGuestAndSignIn(): Promise<void> {
  if (!discordEnabled) return;
  const user = await getCurrentUser();
  if (!user?.isGuest) return;

  const { success } = await rateLimit(`auth:${user.id}`, { limit: 10, windowSeconds: 60 });
  if (!success) return;

  await signOut({ redirect: false });
  await signIn("discord", { redirectTo: "/" });
}
