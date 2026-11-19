// Masquage pour le rôle DEV (lecture seule) : il voit que des comptes partagent une IP ou se ressemblent,
// jamais l'adresse elle-même. Appliqué côté serveur, avant le rendu.

/** 86.245.12.3 → 86.245.x.x ; 2a01:cb00:1:2::5 → 2a01:cb00:… */
export function maskIp(ip: string): string {
  if (ip.includes(":")) {
    const groups = ip.split(":").filter(Boolean);
    return `${groups.slice(0, 2).join(":")}:…`;
  }
  const parts = ip.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.x.x` : "…";
}

/** paul.mehr68@gmail.com → pa***@gmail.com */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}

/** Appareil : seuls les 6 premiers caractères, pour distinguer deux appareils sans exposer le cookie. */
export function shortDevice(id: string): string {
  return id.slice(0, 6);
}
