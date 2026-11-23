import type { KyaraRules } from "./rules";

// Fenêtre de l'import : une seule demande, dans les windowDays jours qui suivent la sortie pour un compte déjà
// inscrit, ou qui suivent l'inscription (le compte devient réel : Discord ou e-mail) pour un compte plus récent.
// Une demande faite à temps peut être traitée après. L'équipe peut toujours faire une demande de test.

const DAY_MS = 86_400_000;

/** Fin de la fenêtre (exclue) : max(sortie, inscription) + windowDays jours. Sans date d'inscription : la création. */
export function importDeadline(launchAt: number, registeredAt: number | null, createdAt: number, windowDays: number): number {
  return Math.max(launchAt, registeredAt ?? createdAt) + windowDays * DAY_MS;
}

export type KyaraPlayer = {
  isGuest: boolean;
  registeredAt: Date | null;
  createdAt: Date;
  /** Compte Discord lié (Account « discord ») : c'est lui qui prouve que le profil Kyara est le sien. */
  discordLinked: boolean;
  /** Banni, gelé, suppression demandée ou anonymisé. */
  unavailable: boolean;
  staff: boolean;
};

export type KyaraIneligibility = "DISABLED" | "NOT_LAUNCHED" | "UNAVAILABLE" | "GUEST" | "EXPIRED" | "NO_DISCORD";

export type KyaraEligibility =
  | { ok: true; deadline: number | null }
  | { ok: false; reason: KyaraIneligibility; deadline: number | null; opensAt: number | null };

export function kyaraEligibility(p: KyaraPlayer, r: KyaraRules, now: number): KyaraEligibility {
  const launched = r.launchAt !== null && r.staffKyaraUserId !== null && now >= r.launchAt;
  if (!p.staff) {
    if (!r.enabled) return { ok: false, reason: "DISABLED", deadline: null, opensAt: null };
    if (!launched) return { ok: false, reason: "NOT_LAUNCHED", deadline: null, opensAt: r.launchAt };
  }
  if (p.unavailable) return { ok: false, reason: "UNAVAILABLE", deadline: null, opensAt: null };
  if (p.isGuest) return { ok: false, reason: "GUEST", deadline: null, opensAt: null };
  // Équipe hors lancement : pas d'échéance (demande de test)
  const deadline = launched && r.launchAt !== null ? importDeadline(r.launchAt, p.registeredAt?.getTime() ?? null, p.createdAt.getTime(), r.windowDays) : null;
  if (deadline !== null && now >= deadline && !p.staff) return { ok: false, reason: "EXPIRED", deadline, opensAt: null };
  if (!p.discordLinked) return { ok: false, reason: "NO_DISCORD", deadline, opensAt: null };
  return { ok: true, deadline };
}
