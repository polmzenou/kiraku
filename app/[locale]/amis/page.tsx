import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { GuestBootstrap } from "@/components/GuestBootstrap";
import { PageShell } from "@/components/PageShell";
import { SectionTitle } from "@/components/SectionTitle";
import { AddFriendForm } from "@/components/social/AddFriendForm";
import { PlayerRow } from "@/components/social/PlayerRow";
import { RowActions } from "@/components/social/RowActions";
import { buttonClasses } from "@/components/ui/Button";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Link } from "@/i18n/navigation";
import { SEARCH_MAX_LENGTH } from "@/lib/catalog/search";
import { ChatWithButton } from "@/components/chat/ChatDock";
import { TradeList, TradeReveals } from "@/components/social/TradeList";
import { countIncomingRequests, listBlocked, listFriends, listRequests } from "@/server/social/queries";
import { expireTradesFor } from "@/server/social/trade-core";
import { countIncomingTrades, listTrades } from "@/server/social/trades";
import { prisma } from "@/server/db";
import { getSetting } from "@/server/settings";
import { getCurrentUser } from "@/server/user";
import { inputClass } from "@/components/ui/Field";
import { GiftSealedButton } from "@/components/social/GiftSealedButton";
import type { GiftLimits } from "@/components/social/GiftSheet";
import type { SealedKind } from "@/lib/boosters/draw";
import { findOwnSealed } from "@/server/boosters/open";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const TABS = ["amis", "demandes", "echanges", "bloques"] as const;
type Tab = (typeof TABS)[number];

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

/** Amis, demandes reçues et envoyées, joueurs bloqués. Réservé aux comptes inscrits. */
export default async function FriendsPage({ searchParams }: PageProps<"/[locale]/amis">) {
  const [t, format, user, sp] = await Promise.all([getTranslations("friends"), getFormatter(), getCurrentUser(), searchParams]);

  if (!user) {
    return (
      <PageShell>
        <GuestBootstrap />
      </PageShell>
    );
  }

  const title = <SectionTitle level={1} kanji="友" title={t("title")} subtitle={t("subtitle")} />;

  if (user.isGuest || !(await getSetting("social.enabled"))) {
    return (
      <PageShell>
        {title}
        <div className="flex flex-col items-start gap-3 lacquer rounded-card p-4">
          <p>{user.isGuest ? t("guestOnly") : t("disabled")}</p>
          {user.isGuest && (
            <ButtonLink href="/inscription" variant="primary">
              {t("signUp")}
            </ButtonLink>
          )}
        </div>
      </PageShell>
    );
  }

  const rawTab = one(sp.onglet);
  const tab: Tab = TABS.includes(rawTab as Tab) ? (rawTab as Tab) : "amis";
  const q = (one(sp.q) ?? "").trim().slice(0, SEARCH_MAX_LENGTH);
  const page = Math.min(Math.max(Number.parseInt(one(sp.page) ?? "0", 10) || 0, 0), 1000);
  const [incomingCount, incomingTrades, tradesEnabled] = await Promise.all([
    countIncomingRequests(user.id),
    countIncomingTrades(user.id),
    getSetting("trades.enabled"),
  ]);

  const tabLink = (key: Tab, label: string, badge?: number) => (
    <li key={key}>
      <Link
        href={key === "amis" ? "/amis" : `/amis?onglet=${key}`}
        aria-current={tab === key ? "page" : undefined}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-3 text-sm text-text-muted aria-[current=page]:bg-surface-2 aria-[current=page]:font-bold aria-[current=page]:text-text"
      >
        {label}
        {badge ? (
          <span className="rounded-full bg-shu-btn px-1.5 text-xs font-bold text-washi-paper tabular-nums">{badge}</span>
        ) : null}
      </Link>
    </li>
  );

  return (
    <PageShell>
      {title}

      <nav aria-label={t("tabsLabel")}>
        <ul className="flex flex-wrap gap-1 lacquer rounded-card p-1">
          {tabLink("amis", t("tabs.friends"))}
          {tabLink("demandes", t("tabs.requests"), incomingCount)}
          {tradesEnabled && tabLink("echanges", t("tabs.trades"), incomingTrades)}
          {tabLink("bloques", t("tabs.blocked"))}
        </ul>
      </nav>

      {tab === "amis" && <FriendsTab userId={user.id} q={q} page={page} sachet={await giftableSealed(user.id, one(sp.sachet))} />}
      {tab === "demandes" && <RequestsTab userId={user.id} format={format} />}
      {tab === "echanges" && <TradesTab userId={user.id} />}
      {tab === "bloques" && <BlockedTab userId={user.id} />}
    </PageShell>
  );
}

/** Sachet scellé à offrir (?sachet=…) : seulement s'il est au joueur, non ouvert et encore offrable. */
async function giftableSealed(userId: string, raw: string | undefined) {
  if (!raw || !/^[A-Za-z0-9_-]{1,40}$/.test(raw)) return null;
  const found = await findOwnSealed(userId, raw);
  return found?.giftable ? found : null;
}

/** Limites citées par les messages de refus d'un cadeau. */
async function giftLimits(): Promise<GiftLimits> {
  const [perDaySent, perDayReceived, minAccountAgeHours, minFriendshipHours, sealedMinAccountDays, sealedPerWeek] = await Promise.all([
    getSetting("gifts.perDaySent"),
    getSetting("gifts.perDayReceived"),
    getSetting("gifts.minAccountAgeHours"),
    getSetting("gifts.minFriendshipHours"),
    getSetting("gifts.sealedMinAccountDays"),
    getSetting("gifts.sealedPerWeek"),
  ]);
  return { perDaySent, perDayReceived, minAccountAgeHours, minFriendshipHours, sealedMinAccountDays, sealedPerWeek };
}

async function FriendsTab({ userId, q, page, sachet }: { userId: string; q: string; page: number; sachet: { id: string; kind: SealedKind } | null }) {
  const t = await getTranslations("friends");
  const [{ items, hasMore }, limits] = await Promise.all([listFriends(userId, q, page), sachet ? giftLimits() : null]);
  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (p > 0) params.set("page", String(p));
    if (sachet) params.set("sachet", sachet.id);
    const s = params.toString();
    return s ? `/amis?${s}` : "/amis";
  };

  return (
    <>
      {sachet && (
        <p role="status" className="flex items-center gap-3 rounded-card border border-kin bg-surface p-4 text-sm">
          <span aria-hidden="true" lang="ja" className="font-seal text-3xl text-kin">
            {sachet.kind === "divin" ? "天" : "滅"}
          </span>
          {t(sachet.kind === "divin" ? "pickForSealedDivin" : "pickForSealedApocalypse")}
        </p>
      )}
      <AddFriendForm />

      <section className="flex flex-col gap-3">
        <SectionTitle kanji="友" title={t("listTitle")} />
        {/* Recherche dans ses propres amis uniquement, filtrée côté serveur */}
        <form action="" className="flex gap-2" role="search">
          <label htmlFor="friends-q" className="sr-only">
            {t("searchLabel")}
          </label>
          {sachet && <input type="hidden" name="sachet" value={sachet.id} />}
          <input
            id="friends-q"
            type="search"
            name="q"
            defaultValue={q}
            maxLength={SEARCH_MAX_LENGTH}
            placeholder={t("searchPlaceholder")}
            className={`${inputClass} flex-1`}
          />
          <button type="submit" className={buttonClasses("secondary")}>
            {t("search")}
          </button>
        </form>

        {items.length === 0 ? (
          <p className="lacquer rounded-card p-4 text-sm text-text-muted">{q ? t("noMatch") : t("empty")}</p>
        ) : (
          <ul className="lacquer rounded-card px-3">
            {items.map((f) => (
              <PlayerRow key={f.id} player={f}>
                {sachet && limits && <GiftSealedButton username={f.username} name={f.username} drop={sachet.id} kind={sachet.kind} limits={limits} />}
                <ChatWithButton username={f.username} />
              </PlayerRow>
            ))}
          </ul>
        )}

        {(page > 0 || hasMore) && (
          <nav aria-label={t("pagination")} className="flex justify-between gap-2">
            {page > 0 ? <ButtonLink href={pageHref(page - 1)}>{t("previous")}</ButtonLink> : <span />}
            {hasMore && <ButtonLink href={pageHref(page + 1)}>{t("next")}</ButtonLink>}
          </nav>
        )}
      </section>
    </>
  );
}

async function RequestsTab({ userId, format }: { userId: string; format: Awaited<ReturnType<typeof getFormatter>> }) {
  const t = await getTranslations("friends");
  const { incoming, outgoing } = await listRequests(userId);
  const since = (d: Date) => format.relativeTime(d);

  return (
    <>
      <section className="flex flex-col gap-3">
        <SectionTitle kanji="友" title={t("incoming")} />
        {incoming.length === 0 ? (
          <p className="lacquer rounded-card p-4 text-sm text-text-muted">{t("noIncoming")}</p>
        ) : (
          <ul className="lacquer rounded-card px-3">
            {incoming.map((p) => (
              <PlayerRow key={p.id} player={p} detail={since(p.since)}>
                <RowActions username={p.username} mode="incoming" />
              </PlayerRow>
            ))}
          </ul>
        )}
      </section>
      <section className="flex flex-col gap-3">
        <SectionTitle kanji="友" title={t("outgoing")} />
        {outgoing.length === 0 ? (
          <p className="lacquer rounded-card p-4 text-sm text-text-muted">{t("noOutgoing")}</p>
        ) : (
          <ul className="lacquer rounded-card px-3">
            {outgoing.map((p) => (
              <PlayerRow key={p.id} player={p} detail={since(p.since)}>
                <RowActions username={p.username} mode="outgoing" />
              </PlayerRow>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

async function BlockedTab({ userId }: { userId: string }) {
  const t = await getTranslations("friends");
  const blocked = await listBlocked(userId);
  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm text-text-muted">{t("blockedIntro")}</p>
      {blocked.length === 0 ? (
        <p className="lacquer rounded-card p-4 text-sm text-text-muted">{t("noBlocked")}</p>
      ) : (
        <ul className="lacquer rounded-card px-3">
          {blocked.map((p) => (
            <PlayerRow key={p.id} player={p}>
              <RowActions username={p.username} mode="blocked" />
            </PlayerRow>
          ))}
        </ul>
      )}
    </section>
  );
}

async function TradesTab({ userId }: { userId: string }) {
  const [t, locale] = await Promise.all([getTranslations("trades"), getLocale()]);
  // Les propositions échues passent en « Expiré » avant l'affichage
  await expireTradesFor(prisma, userId);
  const { received, sent, history, reveals } = await listTrades(userId, locale);
  return (
    <>
      <p className="text-sm text-text-muted">{t("intro")}</p>
      <TradeReveals tradeIds={reveals.tradeIds} cards={reveals.cards} />
      <section className="flex flex-col gap-3">
        <SectionTitle kanji="換" title={t("received")} />
        <TradeList trades={received} mode="received" />
      </section>
      <section className="flex flex-col gap-3">
        <SectionTitle kanji="換" title={t("sent")} />
        <TradeList trades={sent} mode="sent" />
      </section>
      <section className="flex flex-col gap-3">
        <SectionTitle kanji="記" title={t("history")} />
        <TradeList trades={history} mode="history" />
      </section>
    </>
  );
}
