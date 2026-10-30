type Role = { id: string; permissions: string };

// Rôles de l'équipe du serveur Kiraku : le développeur a volontairement peu de droits globaux.
const KIRAKU_STAFF = new Set(["1565774061102174369", "1565774480813334590", "1565776037973983403"]);
const MANAGEMENT = [1n, 2n, 3n, 5n, 13n, 28n, 40n].reduce((mask, bit) => mask | (1n << bit), 0n);

export function discordStaffRole(role: Role, guildId: string): boolean {
  return (guildId === "1565773684243697905" && KIRAKU_STAFF.has(role.id)) || Boolean(BigInt(role.permissions) & MANAGEMENT);
}
