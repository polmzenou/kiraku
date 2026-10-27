"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Realtime } from "ably";
import { configureActivity, getActivity, subscribeActivity } from "./activity";

// Une seule connexion Ably par onglet, partagée par la cloche, le chat, la file d'attente, le salon et
// le plateau de combat. Ouverte seulement quand le joueur est là (onglet visible, geste récent), fermée
// sinon : moins de connexions simultanées sur le plan gratuit d'Ably. Sans clé côté serveur, rien ne
// se connecte et chaque écran garde son sondage (plus lent avec usePoll).

type Handler = (data: unknown) => void;

type RealtimeContext = {
  /** Connexion ouverte : les sondages passent à leur délai de secours. */
  connected: boolean;
  idleSeconds: number;
  backoffMax: number;
  /** S'abonne au canal privé du joueur (`user`) ou à celui d'une partie dont il est participant. */
  subscribe: (channel: "user" | { battle: string }, event: string, handler: Handler) => () => void;
};

const Ctx = createContext<RealtimeContext>({
  connected: false,
  idleSeconds: 300,
  backoffMax: 4,
  subscribe: () => () => {},
});

const TOKEN_URL = "/api/realtime/token";

export function RealtimeProvider({
  userId,
  enabled,
  idleSeconds,
  backoffMax,
  children,
}: {
  userId: string | null;
  enabled: boolean;
  idleSeconds: number;
  backoffMax: number;
  children: ReactNode;
}) {
  const [connected, setConnected] = useState(false);
  const client = useRef<Realtime | null>(null);
  const battleId = useRef<string | null>(null);
  // Abonnements demandés, rejoués quand le client est prêt
  const pending = useRef(new Set<{ channel: string; event: string; handler: Handler; battle: string | null }>());

  useEffect(() => configureActivity(idleSeconds), [idleSeconds]);

  const attach = useCallback((ably: Realtime, sub: { channel: string; event: string; handler: Handler }) => {
    // Rejeté quand la connexion se ferme (joueur absent) : Ably rattache le canal à la reconnexion
    ably.channels.get(sub.channel).subscribe(sub.event, (msg) => sub.handler(msg.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!enabled || !userId) return;
    let closed = false;
    let stopActivity = () => {};
    void import("ably").then(({ Realtime }) => {
      if (closed) return;
      const battle = battleId.current;
      const ably = new Realtime({ authUrl: TOKEN_URL, ...(battle ? { authParams: { battle } } : {}), autoConnect: false, closeOnUnload: true });
      client.current = ably;
      ably.connection.on((change) => setConnected(change.current === "connected"));
      for (const sub of pending.current) attach(ably, sub);
      const sync = () => {
        const state = ably.connection.state;
        if (getActivity().active) {
          if (state !== "connected" && state !== "connecting") ably.connect();
        } else if (state === "connected" || state === "connecting" || state === "disconnected") {
          ably.close();
        }
      };
      stopActivity = subscribeActivity(sync);
      sync();
    });
    return () => {
      closed = true;
      stopActivity();
      client.current?.close();
      client.current = null;
      setConnected(false);
    };
  }, [attach, enabled, userId]);

  const subscribe = useCallback<RealtimeContext["subscribe"]>(
    (channel, event, handler) => {
      if (!userId) return () => {};
      const battle = channel === "user" ? null : channel.battle;
      const sub = { channel: battle ? `kiraku:battle:${battle}` : `kiraku:user:${userId}`, event, handler, battle };
      pending.current.add(sub);
      const ably = client.current;
      if (ably && battle && battleId.current !== battle) {
        // Nouveau jeton qui ouvre aussi le canal de cette partie (le serveur vérifie la participation)
        battleId.current = battle;
        void ably.auth
          .authorize(undefined, { authUrl: TOKEN_URL, authParams: { battle } })
          .catch(() => {})
          .then(() => pending.current.has(sub) && attach(ably, sub));
      } else if (ably) {
        attach(ably, sub);
      } else if (battle) {
        battleId.current = battle;
      }
      return () => {
        pending.current.delete(sub);
        client.current?.channels.get(sub.channel).unsubscribe(event);
      };
    },
    [attach, userId],
  );

  const value = useMemo(() => ({ connected, idleSeconds, backoffMax, subscribe }), [backoffMax, connected, idleSeconds, subscribe]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRealtime(): RealtimeContext {
  return useContext(Ctx);
}
