import type { ReactNode } from "react";
import { isFrozen } from "@/lib/account/deletion";
import { hidesPresence } from "@/lib/social/presence";
import { ablyEnabled } from "@/server/env";
import { getSetting } from "@/server/settings";
import { getCurrentUser } from "@/server/user";
import { PresenceHeartbeat } from "../social/PresenceHeartbeat";
import { PushSessionGuard } from "../social/PushSessionGuard";
import { RealtimeProvider } from "./RealtimeProvider";

/** Connexion temps réel, réglages d'activité et battement de présence de la page (lus côté serveur, en cache). */
export async function RealtimeRoot({ children }: { children: ReactNode }) {
  const [user, idleSeconds, backoffMax, heartbeatSeconds] = await Promise.all([
    getCurrentUser(),
    getSetting("activity.idleSeconds"),
    getSetting("activity.backoffMax"),
    getSetting("presence.heartbeatSeconds"),
  ]);
  // Compte inscrit et actif, sans hors ligne choisi : les invités n'ont pas de présence
  const present = user && !user.isGuest && !user.bannedAt && !isFrozen(user) && !hidesPresence(user);
  // Banni (compte ou réseau) : le jeton lui est refusé, inutile d'ouvrir une connexion qui le redemanderait sans fin
  return (
    <RealtimeProvider userId={user?.id ?? null} enabled={ablyEnabled && Boolean(user) && !user?.bannedAt} idleSeconds={idleSeconds} backoffMax={backoffMax}>
      {present && <PresenceHeartbeat seconds={heartbeatSeconds} />}
      {/* Sans compte inscrit, l'abonnement Web Push de ce navigateur est celui du compte d'avant (déconnexion) */}
      {(!user || user.isGuest) && <PushSessionGuard />}
      {children}
    </RealtimeProvider>
  );
}
