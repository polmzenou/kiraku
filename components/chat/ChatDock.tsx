"use client";

import { useFormatter, useNow, useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { usePathname } from "@/i18n/navigation";
import { unreadBadge } from "@/lib/chat/message";
import {
  chatStatusAction,
  listConversationsAction,
  loadConversationAction,
  sendChatMessageAction,
} from "@/server/actions/chat";
import type { ChatMessageView, Conversation } from "@/server/chat/queries";
import { displayName } from "../profile/ProfileHeader";
import { useRealtime } from "../realtime/RealtimeProvider";
import { usePoll } from "../realtime/usePoll";
import { PlayerAvatar } from "../social/PlayerAvatar";
import { PlayerName } from "../social/PlayerName";
import { badgeClasses } from "../ui/Badge";
import { CloseIcon, IconButton, iconButtonClasses } from "../ui/IconButton";
import { closeChat, openChat, setChatAvailable, setUnread, showConversation, useChatState } from "./chat-store";

type Props = { pollSeconds: number; initialUnread: number; maxLength: number; retentionHours: number };

type IncomingChat = { from: string; message: ChatMessageView };
type Thread = { username: string; messages: ChatMessageView[]; hasMore: boolean; error: string | null };

const EMPTY: ChatMessageView[] = [];

/**
 * Chat entre amis. Desktop : bulle en bas à droite, au-dessus de tout, qui ouvre un panneau.
 * Mobile : l'icône de l'en-tête (ChatHeaderButton) ouvre le même panneau en plein écran.
 * Messages poussés par Ably sur le canal privé du joueur, sinon sondés tant que la conversation est ouverte.
 */
export function ChatDock({ pollSeconds, initialUnread, maxLength, retentionHours }: Props) {
  const t = useTranslations("chat");
  const pathname = usePathname();
  const chat = useChatState();
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  // Fil de la conversation ouverte, rattaché à son ami : un changement d'ami n'affiche jamais l'ancien
  const [thread, setThread] = useState<Thread | null>(null);
  const current = thread && thread.username === chat.with ? thread : null;
  const messages = current?.messages ?? EMPTY;
  const withRef = useRef<string | null>(null);
  const lastAt = useRef<string | null>(null);
  useEffect(() => {
    withRef.current = chat.open ? chat.with : null;
  }, [chat.open, chat.with]);
  useEffect(() => {
    lastAt.current = messages.at(-1)?.at ?? null;
  }, [messages]);

  useEffect(() => {
    setUnread(initialUnread);
    setChatAvailable(true);
    return () => setChatAvailable(false);
  }, [initialUnread]);

  const refreshList = useCallback(
    () =>
      listConversationsAction({}).then((res) => {
        if (!res.ok) return;
        setConversations(res.conversations);
        setUnread(res.conversations.reduce((sum, c) => sum + c.unread, 0));
      }),
    [],
  );

  /** Ajoute des messages au fil de `username`, s'il est toujours celui affiché. */
  const append = useCallback((username: string, incoming: ChatMessageView[], older = false) => {
    setThread((t) => (t && t.username === username ? { ...t, messages: older ? merge(incoming, t.messages) : merge(t.messages, incoming) } : t));
  }, []);

  const fetchNew = useCallback(async () => {
    const username = withRef.current;
    if (!username) return;
    const res = await loadConversationAction({ username, ...(lastAt.current ? { after: lastAt.current } : {}) });
    if (!res.ok || withRef.current !== username) return;
    if (res.messages.length > 0) append(username, res.messages);
  }, [append]);

  // Un message arrive : dans la conversation ouverte, il s'affiche ; sinon la pastille monte
  const receive = useCallback(
    (data: IncomingChat) => {
      if (withRef.current === data.from) {
        append(data.from, [data.message]);
        void fetchNew(); // marque comme lu
      } else {
        void chatStatusAction({}).then((res) => res.ok && setUnread(res.unread));
        if (conversations) void refreshList();
      }
    },
    [append, conversations, fetchNew, refreshList],
  );
  const receiveRef = useRef(receive);
  useEffect(() => {
    receiveRef.current = receive;
  }, [receive]);

  // Temps réel (canal privé du joueur, connexion partagée). La pastille suit le sondage unique de la
  // cloche ; seule une conversation ouverte sans temps réel est sondée ici.
  const { connected, subscribe } = useRealtime();
  useEffect(() => subscribe("user", "chat", (data) => receiveRef.current(data as IncomingChat)), [subscribe]);
  const pollThread = useCallback(async () => {
    await fetchNew();
  }, [fetchNew]);
  usePoll(pollThread, { seconds: pollSeconds, enabled: chat.open && Boolean(chat.with) && !connected });

  // Ouverture : liste des amis ; changement d'ami : ses derniers messages
  useEffect(() => {
    if (!chat.open) return;
    let stale = false;
    const username = chat.with;
    if (!username) {
      void listConversationsAction({}).then((res) => {
        if (stale || !res.ok) return;
        setConversations(res.conversations);
        setUnread(res.conversations.reduce((sum, c) => sum + c.unread, 0));
      });
      return () => {
        stale = true;
      };
    }
    void loadConversationAction({ username }).then((res) => {
      if (stale) return;
      setThread(
        res.ok
          ? { username, messages: res.messages, hasMore: res.hasMore, error: null }
          : { username, messages: [], hasMore: false, error: t(`errors.${res.error}`) },
      );
      if (res.ok) void chatStatusAction({}).then((st) => st.ok && setUnread(st.unread));
    });
    return () => {
      stale = true;
    };
  }, [chat.open, chat.with, t]);

  // Mobile : le panneau couvre l'écran, la page dessous ne défile plus
  useEffect(() => {
    if (!chat.open || window.matchMedia("(min-width: 64rem)").matches) return;
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = before;
    };
  }, [chat.open]);

  const loadOlder = async () => {
    const username = chat.with;
    const first = messages[0];
    if (!username || !first) return;
    const res = await loadConversationAction({ username, before: first.at });
    if (!res.ok) return;
    append(username, res.messages, true);
    setThread((t) => (t && t.username === username ? { ...t, hasMore: res.hasMore } : t));
  };

  const ritual = pathname.startsWith("/ouvrir");
  const badge = unreadBadge(chat.unread);

  return (
    <>
      {!chat.open && !chat.closing && !ritual && (
        <button
          type="button"
          onClick={() => openChat()}
          aria-label={t("open", { count: chat.unread })}
          className="fixed right-6 bottom-6 z-[999999] hidden size-14 items-center justify-center rounded-full bg-linear-to-b from-shu to-shu-btn text-washi-paper shadow-shu transition-transform active:scale-95 motion-reduce:transition-none lg:flex"
        >
          <ChatIcon size={24} />
          {badge && (
            <span aria-hidden="true" className={badgeClasses("kin", "absolute -top-0.5 -right-0.5 ring-2 ring-bg")}>
              {badge}
            </span>
          )}
        </button>
      )}

      {(chat.open || chat.closing) && (
        <section
          data-closing={chat.closing || undefined}
          inert={chat.closing || undefined}
          role="dialog"
          aria-label={t("title")}
          onKeyDown={(e) => e.key === "Escape" && closeChat()}
          className="fixed inset-0 z-[999999] flex translate-y-0 flex-col bg-bg pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] opacity-100 transition-[translate,opacity] duration-300 ease-out starting:translate-y-full starting:opacity-0 motion-reduce:transition-none lg:inset-auto lg:right-6 lg:bottom-6 lg:h-[min(560px,calc(100dvh-7rem))] lg:w-[380px] lg:overflow-hidden lg:rounded-hero lg:border lg:border-border lg:p-0 lg:shadow-float lg:starting:translate-y-12 data-closing:translate-y-full data-closing:opacity-0 lg:data-closing:translate-y-12"
        >
          <header className="flex items-center gap-2 border-b border-border px-3 py-2">
            {chat.with ? (
              <button
                type="button"
                onClick={() => showConversation(null)}
                aria-label={t("back")}
                className="inline-flex size-11 items-center justify-center rounded-full text-xl hover:bg-surface-2"
              >
                <span aria-hidden="true">←</span>
              </button>
            ) : (
              <span aria-hidden="true" lang="ja" className="flex size-11 items-center justify-center font-seal text-xl text-shu">
                話
              </span>
            )}
            <h2 className="min-w-0 flex-1 truncate font-heading text-lg font-extrabold">
              {chat.with ? (
                <PlayerName name={chat.with} color={conversations?.find((c) => c.username === chat.with)?.decor.nameColor} className="truncate" />
              ) : (
                t("title")
              )}
            </h2>
            <IconButton aria-label={t("close")} onClick={closeChat} tone="plain">
              <CloseIcon />
            </IconButton>
          </header>

          {chat.with ? (
            <ConversationView
              key={chat.with}
              username={chat.with}
              messages={messages}
              loading={!current}
              hasMore={current?.hasMore ?? false}
              error={current?.error ?? null}
              maxLength={maxLength}
              retentionHours={retentionHours}
              onOlder={loadOlder}
              onSent={(m) => append(chat.with!, [m])}
            />
          ) : (
            <ConversationList conversations={conversations} />
          )}
        </section>
      )}
    </>
  );
}

/** Fusionne sans doublon, dans l'ordre chronologique. */
function merge(a: ChatMessageView[], b: ChatMessageView[]): ChatMessageView[] {
  const byId = new Map([...a, ...b].map((m) => [m.id, m]));
  return [...byId.values()].sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0));
}

function ConversationList({ conversations }: { conversations: Conversation[] | null }) {
  const t = useTranslations("chat");
  const tAccount = useTranslations("account");
  const format = useFormatter();
  const now = useNow();
  if (!conversations) return <p className="p-4 text-sm text-text-muted">{t("loading")}</p>;
  if (conversations.length === 0) return <p className="p-4 text-sm text-text-muted">{t("noFriends")}</p>;
  return (
    <ul className="flex-1 overflow-y-auto overscroll-contain p-2">
      {conversations.map((c) => (
        <li key={c.username}>
          <button
            type="button"
            onClick={() => showConversation(c.username)}
            className="flex min-h-16 w-full items-center gap-3 rounded-control px-2 py-2 text-left hover:bg-surface-2"
          >
            <PlayerAvatar username={c.username} image={c.image} size={40} frame={c.decor.frame} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-baseline justify-between gap-2">
                <PlayerName
                  name={displayName(c.username, c.isGuest, (code) => tAccount("guestName", { code }))}
                  color={c.decor.nameColor}
                  className="truncate font-bold"
                />
                {c.last && <span className="shrink-0 text-xs text-text-muted">{format.relativeTime(new Date(c.last.at), now)}</span>}
              </span>
              <span className={`truncate text-sm ${c.unread > 0 ? "font-bold text-text" : "text-text-muted"}`}>
                {c.last ? (c.last.mine ? t("you", { body: c.last.body }) : c.last.body) : t("startTalking")}
              </span>
            </span>
            {c.unread > 0 && (
              <span className="shrink-0 rounded-pill bg-shu-btn px-1.5 text-xs font-bold text-washi-paper tabular-nums">
                {unreadBadge(c.unread)}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

function ConversationView({
  username,
  messages,
  loading,
  hasMore,
  error,
  maxLength,
  retentionHours,
  onOlder,
  onSent,
}: {
  username: string;
  messages: ChatMessageView[];
  loading: boolean;
  hasMore: boolean;
  error: string | null;
  maxLength: number;
  retentionHours: number;
  onOlder: () => void;
  onSent: (m: ChatMessageView) => void;
}) {
  const t = useTranslations("chat");
  const format = useFormatter();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const inputId = useId();
  const lastId = messages.at(-1)?.id;

  // Dernier message en vue à chaque arrivée
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [lastId]);
  useEffect(() => input.current?.focus({ preventScroll: true }), []);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await sendChatMessageAction({ username, body });
      if (!res.ok) setSendError(t(`errors.${res.error}`));
      else {
        onSent(res.message);
        setDraft("");
      }
    } catch {
      setSendError(t("errors.UNAVAILABLE"));
    } finally {
      setSending(false);
      input.current?.focus({ preventScroll: true });
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <>
      <div ref={scroller} className="flex flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-3" aria-live="polite">
        {/* Messages éphémères : rappelé en tête de chaque discussion */}
        <p className="mx-auto flex max-w-[90%] items-center gap-1.5 rounded-pill border border-border px-3 py-1 text-center text-xs text-text-muted">
          <span aria-hidden="true" lang="ja" className="font-seal text-shu">
            消
          </span>
          {t("ephemeral", { hours: retentionHours })}
        </p>
        {hasMore && (
          <button type="button" onClick={onOlder} className="mx-auto min-h-11 rounded-pill px-3 text-sm text-text-muted hover:bg-surface-2">
            {t("older")}
          </button>
        )}
        {error && <p className="text-sm text-shu">{error}</p>}
        {loading && <p className="m-auto text-sm text-text-muted">{t("loading")}</p>}
        {!loading && !error && messages.length === 0 && (
          <p className="m-auto text-center text-sm text-text-muted">{t("empty", { name: username })}</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex flex-col gap-0.5 ${m.mine ? "items-end" : "items-start"}`}>
            <p
              className={`max-w-[85%] rounded-card px-3 py-2 text-sm break-words whitespace-pre-wrap ${
                m.mine ? "rounded-br-sm bg-shu-btn text-washi-paper" : "rounded-bl-sm bg-surface-2 text-text"
              }`}
            >
              {m.body}
            </p>
            <time dateTime={m.at} className="px-1 text-[11px] text-text-muted">
              {format.dateTime(new Date(m.at), { hour: "2-digit", minute: "2-digit" })}
            </time>
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex flex-col gap-1 border-t border-border p-2"
      >
        {sendError && (
          <p role="alert" className="px-1 text-xs text-shu">
            {sendError}
          </p>
        )}
        <div className="flex items-end gap-2">
          <label htmlFor={inputId} className="sr-only">
            {t("inputLabel", { name: username })}
          </label>
          <textarea
            id={inputId}
            ref={input}
            value={draft}
            maxLength={maxLength}
            rows={1}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            placeholder={t("placeholder")}
            className="max-h-32 min-h-11 flex-1 resize-none rounded-control border border-border bg-surface px-3 py-2.5 text-base text-text placeholder:text-text-muted"
          />
          <button
            type="submit"
            disabled={sending || draft.trim().length === 0}
            aria-label={t("send")}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-linear-to-b from-shu to-shu-btn text-washi-paper disabled:opacity-50"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5 fill-current">
              <path d="M2.5 9.6 17 3l-6.6 14.5-1.9-6.1-6-1.8Z" />
            </svg>
          </button>
        </div>
      </form>
    </>
  );
}

/** Icône du chat dans l'en-tête, sur mobile seulement (la bulle prend le relais sur desktop). */
export function ChatHeaderButton() {
  const t = useTranslations("chat");
  const chat = useChatState();
  const badge = unreadBadge(chat.unread);
  if (!chat.available) return null;
  return (
    <button
      type="button"
      onClick={() => openChat()}
      aria-label={t("open", { count: chat.unread })}
      title={t("title")}
      className={iconButtonClasses("lacquer", "lg:hidden")}
    >
      <ChatIcon size={20} />
      {badge && (
        <span aria-hidden="true" className={badgeClasses("shu", "absolute -top-0.5 -right-0.5 ring-2 ring-bg")}>
          {badge}
        </span>
      )}
    </button>
  );
}

/** Bouton « Discuter » réutilisable (lignes d'amis, profil, échanges). */
export function ChatWithButton({ username, className = "" }: { username: string; className?: string }) {
  const t = useTranslations("chat");
  const chat = useChatState();
  if (!chat.available) return null;
  return (
    <button
      type="button"
      onClick={() => openChat(username)}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-pill px-3 text-sm font-bold text-text-muted hover:bg-surface-2 hover:text-text ${className}`}
    >
      <span aria-hidden="true" lang="ja" className="font-seal text-shu">
        話
      </span>
      {t("discuss")}
    </button>
  );
}

/** Bulle de discussion, au trait comme la cloche des notifications. */
function ChatIcon({ size }: { size: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 12.5c0 3.9-3.6 7-8 7-1.2 0-2.3-.2-3.3-.6L4 20l1.2-3.5C4.4 15.3 4 13.9 4 12.5c0-3.9 3.6-7 8-7s8 3.1 8 7Z" />
      <path d="M8.5 12.5h.01M12 12.5h.01M15.5 12.5h.01" strokeWidth="2.4" />
    </svg>
  );
}
