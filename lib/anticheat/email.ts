// Rapprochement d'adresses e-mail et de pseudos pour la détection des multi-comptes.

const DOMAIN_ALIASES: Record<string, string> = { "googlemail.com": "gmail.com" };
// Domaines qui ignorent les points de la partie locale (p.aul@gmail.com = paul@gmail.com)
const DOTLESS_DOMAINS = new Set(["gmail.com"]);
// Racine trop courte : trop de faux positifs (« jo », « max »)
const MIN_STEM = 4;

function split(email: string): { local: string; domain: string } | null {
  const value = email.trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return null;
  const rawDomain = value.slice(at + 1);
  const domain = DOMAIN_ALIASES[rawDomain] ?? rawDomain;
  let local = value.slice(0, at).split("+")[0];
  if (DOTLESS_DOMAINS.has(domain)) local = local.replaceAll(".", "");
  return local ? { local, domain } : null;
}

/**
 * Boîte de réception réelle : minuscules, « +étiquette » retirée, points retirés chez Gmail,
 * googlemail.com → gmail.com. Deux adresses qui donnent la même valeur arrivent dans la même boîte.
 */
export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const parts = split(email);
  return parts ? `${parts.local}@${parts.domain}` : null;
}

/** Racine d'un mot : lettres et chiffres seulement, chiffres finaux retirés (« paul.mehr68 » → « paulmehr »). */
export function textStem(value: string | null | undefined): string | null {
  if (!value) return null;
  const stem = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .replace(/\d+$/, "");
  return stem.length >= MIN_STEM ? stem : null;
}

/** Racine de la partie locale, quel que soit le domaine (paulmehr@gmail.com ~ paul.mehr2@outlook.fr). */
export function emailStem(email: string | null | undefined): string | null {
  if (!email) return null;
  const parts = split(email);
  return parts ? textStem(parts.local) : null;
}
