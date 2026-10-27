import type { ReactNode } from "react";
import { ablyEnabled } from "@/server/env";
import { getSetting } from "@/server/settings";
import { getCurrentUser } from "@/server/user";
import { RealtimeProvider } from "./RealtimeProvider";

/** Connexion temps réel et réglages d'activité de la page (lus côté serveur, en cache). */
export async function RealtimeRoot({ children }: { children: ReactNode }) {
  const [user, idleSeconds, backoffMax] = await Promise.all([getCurrentUser(), getSetting("activity.idleSeconds"), getSetting("activity.backoffMax")]);
  return (
    <RealtimeProvider userId={user?.id ?? null} enabled={ablyEnabled && Boolean(user)} idleSeconds={idleSeconds} backoffMax={backoffMax}>
      {children}
    </RealtimeProvider>
  );
}
