import "server-only";
import { notFound } from "next/navigation";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { USERNAME_REGEX } from "@/lib/username";
import { getCurrentUser } from "../user";
import { accessFor, findProfileOwner } from "./profile";

/**
 * Chargement commun de /u/[username] et /u/[username]/collection : pseudo validé, joueur trouvé
 * (sinon 404), orthographe exacte du pseudo dans l'URL, droits du visiteur.
 */
export async function loadProfile(rawUsername: string, locale: Locale, suffix = "") {
  const username = decodeURIComponent(rawUsername);
  if (!USERNAME_REGEX.test(username)) notFound();
  const [owner, viewer] = await Promise.all([findProfileOwner(username), getCurrentUser()]);
  if (!owner) notFound();
  if (owner.username !== username) redirect({ href: `/u/${owner.username}${suffix}`, locale });
  return { owner, viewer, access: await accessFor(viewer?.id ?? null, owner) };
}
