// Avatar Discord d'un joueur lié : même adresse que celle qu'Auth.js enregistre à la liaison
// (@auth/core/providers/discord), pour ne réécrire User.image que si l'avatar a vraiment changé.

/** Ce que renvoient GET /users/{id} (bot) et le profil OAuth : seuls ces champs servent. */
export type DiscordUserAvatar = { id: string; avatar: string | null; discriminator?: string | null };

const SNOWFLAKE = /^\d{5,25}$/;
const AVATAR_HASH = /^(a_)?[0-9a-f]{32}$/;

export function isDiscordId(id: string): boolean {
  return SNOWFLAKE.test(id);
}

const AVATAR_PATH = /^\/avatars\/(\d{5,25})\/(?:a_)?[0-9a-f]{32}\.(?:png|jpe?g|webp|gif)$/i;

/**
 * ID Discord lu dans l'adresse d'un avatar personnalisé (cdn.discordapp.com/avatars/<id>/<hash>.<ext>), comme celui
 * qu'affiche Kyara. null pour l'avatar par défaut (embed/avatars/<n>.png), qui ne porte pas l'ID, ou une autre adresse.
 */
export function discordIdFromAvatarUrl(url: string | null): string | null {
  if (url === null) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || (parsed.hostname !== "cdn.discordapp.com" && parsed.hostname !== "media.discordapp.net")) return null;
  return AVATAR_PATH.exec(parsed.pathname)?.[1] ?? null;
}

/**
 * Adresse de l'avatar : l'image du joueur (GIF si animée), sinon l'avatar par défaut de Discord.
 * null si la réponse n'a pas la forme attendue (rien n'est alors écrit).
 */
export function discordAvatarUrl(user: DiscordUserAvatar): string | null {
  if (!isDiscordId(user.id)) return null;
  if (user.avatar === null) {
    const n = !user.discriminator || user.discriminator === "0"
      ? Number((BigInt(user.id) >> BigInt(22)) % BigInt(6))
      : Number.parseInt(user.discriminator, 10) % 5;
    return Number.isInteger(n) ? `https://cdn.discordapp.com/embed/avatars/${n}.png` : null;
  }
  if (!AVATAR_HASH.test(user.avatar)) return null;
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith("a_") ? "gif" : "png"}`;
}
