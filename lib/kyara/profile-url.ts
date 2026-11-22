import { z } from "@/lib/zod";
import { KYARA_HOST, KYARA_ORIGIN } from "./codes";

// Adresse d'un profil public Kyara (bouton « Mon profil public ») : https://kyara.games/profil/<uuid>.
// Seul l'uuid est gardé ; l'hôte doit être exactement kyara.games (ni sous-domaine, ni identifiants dans l'URL).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PROFILE_PATH = /^\/profil\/([0-9a-fA-F-]{36})\/?$/;

export const KYARA_PROFILE_INPUT_MAX = 200;

export function isKyaraUserId(value: string): boolean {
  return UUID.test(value);
}

export function kyaraProfileUrl(kyaraUserId: string): string {
  return `${KYARA_ORIGIN}/profil/${kyaraUserId}`;
}

/** uuid en minuscules du profil collé (adresse complète, sans « https:// », ou uuid seul), sinon null. */
export function parseKyaraProfileUrl(input: string): string | null {
  const raw = input.trim();
  if (raw.length === 0 || raw.length > KYARA_PROFILE_INPUT_MAX) return null;
  if (isKyaraUserId(raw.toLowerCase())) return raw.toLowerCase();
  const withScheme = /^kyara\.games\//i.test(raw) ? `https://${raw}` : raw;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== KYARA_HOST || url.port !== "" || url.username !== "" || url.password !== "") return null;
  const id = PROFILE_PATH.exec(url.pathname)?.[1]?.toLowerCase();
  return id && isKyaraUserId(id) ? id : null;
}

/** Champ « adresse de ton profil Kyara » : renvoie l'uuid. */
export const kyaraProfileInputSchema = z
  .string()
  .max(KYARA_PROFILE_INPUT_MAX)
  .transform((value, ctx) => {
    const id = parseKyaraProfileUrl(value);
    if (id === null) {
      ctx.addIssue({ code: "custom", message: "Adresse de profil Kyara invalide" });
      return z.NEVER;
    }
    return id;
  });
