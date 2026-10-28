import "server-only";
import { appUrl } from "./env";

/**
 * Requête POST venue du site lui-même (pas de CSRF) : l'en-tête Origin doit valoir l'origine publique.
 * Derrière Nginx, `request.url` vaut http://localhost:3000 ; on l'accepte seulement pour le dev
 * (autre port, IP du réseau local), aucun navigateur distant n'envoie cette origine.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return origin === new URL(appUrl()).origin || origin === new URL(request.url).origin;
}
