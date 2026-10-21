"use client";

import { useSyncExternalStore } from "react";
import { prefersReducedMotion } from "@/lib/motion-pref-dom";

// État partagé du chat entre l'icône de l'en-tête (mobile), la bulle (desktop), le panneau et les
// boutons « Discuter » ailleurs dans l'app : panneau ouvert, ami ciblé, nombre de non-lus.

type ChatState = {
  open: boolean;
  /** Le panneau redescend : il reste affiché le temps de l'animation de fermeture. */
  closing: boolean;
  with: string | null;
  unread: number;
  available: boolean;
};
type Store = { state: ChatState; listeners: Set<() => void> };

// Une seule instance pour toute la page, même si le module est dupliqué entre deux chunks
// (en-tête du layout et composants d'une page) : le store vit sur globalThis.
const holder = globalThis as typeof globalThis & { __kirakuChat?: Store };
const store: Store = (holder.__kirakuChat ??= {
  state: { open: false, closing: false, with: null, unread: 0, available: false },
  listeners: new Set(),
});

function set(next: Partial<ChatState>) {
  store.state = { ...store.state, ...next };
  for (const l of store.listeners) l();
}

const subscribe = (l: () => void) => {
  store.listeners.add(l);
  return () => store.listeners.delete(l);
};

const SERVER_STATE: ChatState = { open: false, closing: false, with: null, unread: 0, available: false };

/** Durée de l'animation d'ouverture et de fermeture du panneau (classes duration-300 de ChatDock). */
export const CHAT_PANEL_MS = 300;
let closeTimer: ReturnType<typeof setTimeout> | undefined;

export function useChatState(): ChatState {
  return useSyncExternalStore(subscribe, () => store.state, () => SERVER_STATE);
}

/** Ouvre le chat, sur la conversation d'un ami si `username` est donné. */
export function openChat(username?: string) {
  clearTimeout(closeTimer);
  set({ open: true, closing: false, with: username ?? null });
}

/** Ferme le panneau en le laissant redescendre (immédiat si le mouvement est réduit). */
export function closeChat() {
  if (!store.state.open) return;
  const reduced = typeof window !== "undefined" && prefersReducedMotion();
  set({ open: false, closing: !reduced });
  if (reduced) return;
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => set({ closing: false }), CHAT_PANEL_MS);
}

export function showConversation(username: string | null) {
  set({ with: username });
}

export function setUnread(unread: number) {
  set({ unread: Math.max(0, unread) });
}

/** Le dock est monté (compte inscrit, chat ouvert) : les boutons « Discuter » peuvent s'afficher. */
export function setChatAvailable(available: boolean) {
  set({ available });
}
