import { z } from "zod";

// Web Push : validation de l'abonnement envoyé par le navigateur et contenu des messages.
// Le serveur envoie une requête à l'endpoint fourni par le client : seuls les services push
// des navigateurs sont acceptés (sinon, une porte ouverte aux requêtes vers n'importe quel hôte).

/** Hôtes des services push des navigateurs (Chrome/Android, Firefox, Edge/Windows, Safari/iOS). */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/, /^[a-z0-9-]+\.notify\.windows\.com$/, /^([a-z0-9-]+\.)*push\.apple\.com$/];

export function isPushServiceUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
  return PUSH_HOSTS.some((h) => h.test(url.hostname));
}

const base64url = (min: number, max: number) =>
  z
    .string()
    .min(min)
    .max(max)
    .regex(/^[A-Za-z0-9_-]+=*$/);

/** Forme de PushSubscription.toJSON() ; p256dh = 65 octets (87 caractères), auth = 16 octets (22). */
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().min(20).max(1024).refine(isPushServiceUrl),
  keys: z.object({ p256dh: base64url(80, 100), auth: base64url(16, 32) }),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const pushEndpointSchema = z.object({ endpoint: z.string().min(20).max(1024) });

/** Contenu chiffré envoyé au service worker : texte déjà rendu et chemin interne. */
export type PushMessage = { title: string; body: string; url: string; tag: string };

/** L'abonnement n'existe plus chez le service push : on le supprime. */
export function isExpiredPush(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410;
}

/** Le lien d'un push ne mène jamais hors du site. */
export function safePushPath(path: string): string {
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : "/";
}
