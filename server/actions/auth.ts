"use server";

import { refresh } from "next/cache";
import { z } from "@/lib/zod";
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
  // Déjà connecté (cookie posé depuis un autre onglet) : re-rendre la page, comme le ferait un cookie neuf
  if (session?.user?.id) {
    refresh();
    return { ok: true };
  }

  const ip = await clientIp();
  const testIps = (process.env.GUEST_TEST_IPS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!testIps.includes(ip)) {
    const limit = await getSetting("guest.createPerHourPerIp");
    const { success } = await rateLimit(`guest:${ip}`, {
      limit,
      windowSeconds: 3600,
    });

    if (!success) return { ok: false, error: "RATE_LIMITED" };
  }

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

const discordIntent = z.enum(["login", "register"]);

/**
 * Bouton « … avec Discord » de /connexion et /inscription, sans être déjà inscrit.
 * - login : retrouver un compte existant. La session invitée de cet appareil est abandonnée
 *   d'abord (comme pour la connexion par e-mail), sinon Auth.js rattacherait ce Discord à l'invité.
 * - register : créer son compte. L'invité est gardé et Discord lui est rattaché (cartes et
 *   solde conservés) ; si ce Discord a déjà un compte, /connexion/erreur propose d'y aller.
 */
export async function continueWithDiscord(formData: FormData): Promise<void> {
  if (!discordEnabled) return;
  const intent = discordIntent.safeParse(formData.get("intent"));
  if (!intent.success) return;
  const user = await getCurrentUser();
  // Un compte inscrit lie Discord depuis /compte (linkDiscord), pas d'ici
  if (user && !user.isGuest) return;

  const { success } = await rateLimit(`auth:${user?.id ?? await clientIp()}`, { limit: 10, windowSeconds: 60 });
  if (!success) return;

  if (user && intent.data === "login") await signOut({ redirect: false });
  await signIn("discord", { redirectTo: "/" });
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
