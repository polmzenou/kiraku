type Role = { id: string; permissions: string };

// Rôles de l'équipe du serveur Kiraku : le développeur a volontairement peu de droits globaux.
const KIRAKU_STAFF = new Set(["1565774061102174369", "1565774480813334590", "1565776037973983403"]);
const MANAGEMENT = [1n, 2n, 3n, 5n, 13n, 28n, 40n].reduce((mask, bit) => mask | (1n << bit), 0n);

/**
 * Rôle admis à lire un salon privé de l'équipe : rôle de gestion, rôle d'équipe connu du serveur Kiraku, ou rôle ajouté
 * par DISCORD_STAFF_ROLE_IDS (un nouveau rôle de modération sans droit de gestion ne coupe plus les salons privés).
 */
export function discordStaffRole(role: Role, guildId: string, extraStaffIds: readonly string[] = []): boolean {
  return (guildId === "1565773684243697905" && KIRAKU_STAFF.has(role.id)) || extraStaffIds.includes(role.id) || Boolean(BigInt(role.permissions) & MANAGEMENT);
}

/** Liste « id,id,… » de DISCORD_STAFF_ROLE_IDS (déjà validée par le schéma de l'environnement). */
export function staffRoleIds(value: string | undefined): string[] {
  return value ? value.split(",").map((id) => id.trim()).filter(Boolean) : [];
}
