// Expéditeur des e-mails (MAIL_FROM), lu pour l'état affiché dans /admin/general et le précontrôle du déploiement.

/** Domaine de l'adresse d'expédition (« Kiraku <noreply@kiraku-kun.com> » ou « noreply@kiraku-kun.com »), ou null. */
export function senderDomain(from: string | null | undefined): string | null {
  if (!from) return null;
  const address = /<([^<>]+)>\s*$/.exec(from)?.[1] ?? from;
  const match = /^[^\s@]+@([a-z0-9.-]+\.[a-z]{2,})$/i.exec(address.trim());
  return match ? match[1].toLowerCase() : null;
}

/**
 * Expéditeur de test de Resend : il ne livre qu'au propriétaire du compte Resend, tous les autres destinataires
 * sont refusés. Les joueurs ne reçoivent rien tant que MAIL_FROM n'est pas sur un domaine vérifié.
 */
export function isResendTestSender(from: string | null | undefined): boolean {
  return senderDomain(from) === "resend.dev";
}
