import type { ReactNode } from "react";
import { isFrozen } from "@/lib/account/deletion";
import { hidesPresence } from "@/lib/social/presence";
import { ablyEnabled } from "@/server/env";
import { getSetting } from "@/server/settings";
import { getCurrentUser } from "@/server/user";
import { PresenceHeartbeat } from "../social/PresenceHeartbeat";
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
  return (
    <RealtimeProvider userId={user?.id ?? null} enabled={ablyEnabled && Boolean(user)} idleSeconds={idleSeconds} backoffMax={backoffMax}>
      {present && <PresenceHeartbeat seconds={heartbeatSeconds} />}
      {children}
    </RealtimeProvider>
  );
}
