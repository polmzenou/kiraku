"use client";

import Image from "next/image";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { salonHref, type SalonTab } from "@/lib/casino/params";
import { CASINO_MEDIA, SIDE_KANJI } from "@/lib/casino/media";
import type { FlipStats } from "@/lib/casino/view";
import type { Rarity } from "@/lib/catalog/rarity";
import { useRaritySeals } from "@/lib/catalog/use-rarities";
import { coinFlipLobbyAction, coinFlipMineAction, declineCoinFlipAction, type CasinoActionError } from "@/server/actions/casino";
import type { CoinFlipTableView, LobbyPage } from "@/server/casino/queries";
import { Fuda } from "../fuda/Fuda";
import { useRealtime } from "../realtime/RealtimeProvider";
import { usePoll } from "../realtime/usePoll";
import { PlayerAvatar } from "../social/PlayerAvatar";
import { PlayerName } from "../social/PlayerName";
import { Button } from "../ui/Button";
import { ButtonLink } from "../ui/ButtonLink";
import { chipClasses } from "../ui/Chip";
import { segmentedCompactItemClass, segmentedFillClass, segmentedTrackClass } from "../ui/Segmented";
import { CoinFace } from "./CoinFace";
import { Hanko } from "./Hanko";
import { StakeSheet } from "./StakeSheet";
import "./casino.css";

export type SalonTier = { key: string; order: number; rarities: string[] };

type Props = {
  tab: SalonTab;
  tiers: SalonTier[];
  tier: string | null;
  lobby: LobbyPage | null;
  mine: { mine: CoinFlipTableView[]; invitations: CoinFlipTableView[] } | null;
  history: { items: CoinFlipTableView[]; stats: FlipStats } | null;
  /** Compte inscrit qui peut miser (sinon : message aux invités). */
  canPlay: boolean;
  allowed: readonly Rarity[];
  expiryHours: number;
  pollSeconds: number;
  reserveFor: string | null;
  /** Tables relevées pendant l'absence du créateur : le lancer l'attend. */
  replays: CoinFlipTableView[];
  /** Compteurs de l'onglet « Mes tables » (membres seulement). */
  counts: { mine: number; invitations: number } | null;
  maxOpenTables: number;
  /** Empreinte de « Mes tables » au rendu ; le sondage recharge la page quand elle change. */
  signature: string | null;
  /** Pouls du salon : tables ouvertes, lancers du jour de jeu. */
  pulse: { openTables: number; flipsToday: number };
  serverNow: number;
};

/** Au-delà, un rendu restitué par le cache du navigateur (retour arrière) est rechargé dès l'affichage. */
const STALE_RENDER_MS = 15_000;

/** Pastille de rareté du pot : sceau et nom. */
function RarityPill({ rarity }: { rarity: string }) {
  const tRarity = useTranslations("rarity");
  const seals = useRaritySeals();
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-pill bg-bg/50 px-2 py-px text-xs text-text-muted ring-1 ring-border ring-inset">
      <span aria-hidden="true" lang="ja" className="font-seal text-text">
        {seals[rarity]}
      </span>
      <span className="truncate">{tRarity(rarity as "COMMON")}</span>
    </span>
  );
}

/**
 * Carte d'une table : la fuda misée, la face jouée, le joueur, depuis quand elle attend et jusqu'à quand.
 * `children` : le ou les boutons (Relever, Voir, Décliner).
 */
function TableCard({ table, now, children }: { table: CoinFlipTableView; now: number; children: ReactNode }) {
  const t = useTranslations("casino");
  const format = useFormatter();
  const other = table.mine ? table.reservedFor : table.creator;
  return (
    <li
      className={`flex gap-3 rounded-card p-2.5 ring-1 ring-inset ${table.forMe ? "bg-hisui/8 ring-hisui/55" : "bg-surface ring-border/70"}`}
    >
      <Link
        href={`/casino/pile-ou-face/${table.id}`}
        prefetch={false}
        className="w-16 shrink-0 self-start rounded-[7px]"
        aria-label={t("salon.tableOf", { name: table.creator.username })}
      >
        <Fuda card={table.creatorCard} size="sm" tilt={false} still />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <span className="flex min-w-0 flex-col gap-1">
            <b className="truncate font-title text-[15px] leading-tight font-extrabold">{table.creatorCard.name}</b>
            <span className="flex flex-wrap items-center gap-1.5">
              <RarityPill rarity={table.rarity} />
              {table.forMe && <span className="rounded-pill bg-hisui/15 px-2 py-px text-xs font-bold text-hisui">{t("salon.reserved")}</span>}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 rounded-pill bg-bg/50 py-0.5 pr-2 pl-0.5 ring-1 ring-border ring-inset">
            <CoinFace side={table.creatorSide} size={26} />
            <span aria-hidden="true" lang="ja" className="font-seal text-sm">
              {SIDE_KANJI[table.creatorSide]}
            </span>
            <span className="sr-only">{t("salon.plays", { side: t(`side.${table.creatorSide}`) })}</span>
          </span>
        </div>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-text-muted">
          {table.mine ? (
            other && (
              <span className="truncate">
                {t.rich("mine.reservedTo", {
                  name: other.username,
                  player: () => <PlayerName name={other.username} color={other.decor.nameColor} className="font-bold" />,
                })}
              </span>
            )
          ) : (
            <>
              <PlayerAvatar username={table.creator.username} image={table.creator.image} size={20} frame={table.creator.decor.frame} prestige={table.creator.decor.prestige} />
              <PlayerName name={table.creator.username} color={table.creator.decor.nameColor} className="truncate" />
            </>
          )}
          {(other || !table.mine) && <span aria-hidden="true">·</span>}
          <span className="shrink-0">{format.relativeTime(new Date(table.createdAt), now)}</span>
        </span>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <small className="text-xs text-text-muted tabular-nums">{t("mine.expires", { time: format.relativeTime(new Date(table.expiresAt), now) })}</small>
          <span className="flex gap-1.5">{children}</span>
        </div>
      </div>
    </li>
  );
}

/** État vide illustré : la pièce, une phrase, et « Poser une carte » si le joueur peut miser. */
function EmptyState({ title, body, onStake }: { title: string; body?: string; onStake: (() => void) | null }) {
  const t = useTranslations("casino.salon");
  return (
    <div className="flex flex-col items-center gap-3 rounded-card bg-surface px-5 py-7 text-center ring-1 ring-border/70 ring-inset">
      <CoinFace side="OMOTE" size={56} className="-rotate-12" />
      <p className="font-title text-base font-extrabold">{title}</p>
      {body && <p className="max-w-sm text-sm text-text-muted">{body}</p>}
      {onStake && (
        <Button type="button" variant="primary" onClick={onStake}>
          ＋ {t("stake")}
        </Button>
      )}
    </div>
  );
}

/** Salon du pile ou face : tables ouvertes (filtre par palier), mes tables et invitations, historique. */
export function CoinFlipSalon(props: Props) {
  const { tab, tiers, tier, canPlay } = props;
  const t = useTranslations("casino");
  const tRarity = useTranslations("rarity");
  const seals = useRaritySeals();
  const router = useRouter();
  const { subscribe } = useRealtime();
  const [now, setNow] = useState(props.serverNow);
  const [lobby, setLobby] = useState(props.lobby);
  const [lobbySource, setLobbySource] = useState(props.lobby);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sheet, setSheet] = useState(props.reserveFor !== null && canPlay);
  const [error, setError] = useState<CasinoActionError | null>(null);
  const [pending, startTransition] = useTransition();
  const tierOrder = tiers.find((x) => x.key === tier)?.order ?? null;
  const shownIds = useRef(props.lobby?.items.map((i) => i.id).join(",") ?? "");
  const signature = useRef(props.signature);

  // Nouveau rendu du serveur (rechargement) : la liste repart de ses tables
  if (props.lobby !== lobbySource) {
    setLobbySource(props.lobby);
    setLobby(props.lobby);
  }

  useEffect(() => {
    signature.current = props.signature;
  }, [props.signature]);

  // Sondage de la première page des tables ; les pages suivantes restent jusqu'au prochain changement
  const poll = useCallback(async () => {
    setNow(Date.now());
    if (tab !== "tables") return false;
    const res = await coinFlipLobbyAction({ tier: tierOrder, cursor: null });
    if (!res.ok) return false;
    const ids = res.page.items.map((i) => i.id).join(",");
    const changed = ids !== shownIds.current;
    shownIds.current = ids;
    setLobby(res.page);
    return changed;
  }, [tab, tierOrder]);
  usePoll(poll, { seconds: props.pollSeconds, enabled: tab === "tables", backoff: true });

  // « Mes tables », invitations et replays : une table relevée, retirée ou échue, une invitation reçue
  // rechargent la page (temps réel, sondage en secours), sur tous les onglets
  const member = props.signature !== null;
  const pollMine = useCallback(async () => {
    setNow(Date.now());
    const res = await coinFlipMineAction({});
    if (!res.ok || res.signature === signature.current) return false;
    signature.current = res.signature;
    router.refresh();
    return true;
  }, [router]);
  const pollMineNow = usePoll(pollMine, { seconds: props.pollSeconds, realtimeSeconds: props.pollSeconds * 6, enabled: member, backoff: true, channel: "user" });
  useEffect(() => {
    if (!member) return;
    const stops = [subscribe("user", "coinflip", () => void pollMineNow()), subscribe("user", "notification", () => void pollMineNow())];
    return () => stops.forEach((stop) => stop());
  }, [member, pollMineNow, subscribe]);

  // Page restituée par le cache du navigateur (retour arrière) : on la recharge plutôt que d'afficher l'ancien état
  const renderedAt = props.serverNow;
  useEffect(() => {
    if (Date.now() - renderedAt > STALE_RENDER_MS) router.refresh();
  }, [renderedAt, router]);

  const loadMore = async () => {
    if (!lobby?.nextCursor) return;
    setLoadingMore(true);
    const res = await coinFlipLobbyAction({ tier: tierOrder, cursor: lobby.nextCursor });
    setLoadingMore(false);
    if (res.ok) setLobby({ items: [...lobby.items, ...res.page.items], nextCursor: res.page.nextCursor });
  };

  const decline = (flipId: string) =>
    startTransition(async () => {
      const res = await declineCoinFlipAction({ flipId });
      if (res.ok) router.refresh();
      else setError(res.error);
    });

  const openSheet = canPlay ? () => setSheet(true) : null;
  const tableHref = (table: CoinFlipTableView) => `/casino/pile-ou-face/${table.id}`;
  const takeLink = (table: CoinFlipTableView) => (
    <ButtonLink href={tableHref(table)} prefetch={false} size="sm" variant="primary">
      {t("salon.take")}
    </ButtonLink>
  );
  const mineTotal = props.counts ? props.counts.mine + props.counts.invitations : 0;

  return (
    <div className={`flex flex-col gap-4 ${canPlay ? "pb-20 lg:pb-0" : ""}`}>
      <header className="relative isolate flex min-h-40 overflow-hidden rounded-hero border border-border bg-[#15120F] text-[#F1E9DA] md:min-h-44">
        <Image src={CASINO_MEDIA.room.still} alt="" fill priority sizes="(min-width: 768px) 768px, 100vw" className="-z-10 object-cover object-[50%_6%]" />
        <span aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(13_11_9/0.94),rgb(13_11_9/0.7)_55%,rgb(13_11_9/0.35))]" />
        <div className="flex w-full flex-col gap-1.5 p-4 md:flex-row md:items-end md:justify-between md:gap-6 md:p-6">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Link href="/casino" prefetch={false} className="self-start text-sm text-[#C9BFAF] underline-offset-4 hover:underline">
              ‹ {t("salon.back")}
            </Link>
            <h1 className="flex items-center gap-2.5 font-title text-2xl font-extrabold md:text-3xl">
              <Hanko glyph="賭" size={30} />
              {t("salon.title")}
            </h1>
            <p className="max-w-lg text-sm text-[#E4DACA]">{t("salon.lead")}</p>
            <p className="flex items-center gap-2 text-xs text-[#C9BFAF] tabular-nums">
              <span aria-hidden="true" className="size-2 rounded-full bg-hisui shadow-[0_0_0_3px_rgb(91_191_139/0.25)]" />
              {t("salon.pulse", { open: props.pulse.openTables, today: props.pulse.flipsToday })}
            </p>
          </div>
          {canPlay && (
            <div className="hidden shrink-0 lg:block">
              <Button type="button" variant="primary" size="lg" className="shadow-float" onClick={() => setSheet(true)}>
                ＋ {t("salon.stake")}
              </Button>
            </div>
          )}
        </div>
      </header>

      <nav aria-label={t("salon.tabs.label")} className={`${segmentedTrackClass} ${segmentedFillClass}`}>
        {(
          [
            ["tables", t("salon.tabs.tables")],
            ["mes-tables", t("salon.tabs.mine")],
            ["historique", t("salon.tabs.history")],
          ] as const
        ).map(([key, label]) => (
          <Link key={key} href={salonHref({ tab: key, tier })} prefetch={false} aria-current={tab === key ? "page" : undefined} className={segmentedCompactItemClass}>
            {label}
            {key === "mes-tables" && mineTotal > 0 && (
              <span className="inline-grid min-w-5 place-items-center rounded-pill bg-shu-btn px-1.5 text-[11px] leading-5 font-bold text-washi-paper tabular-nums">
                {mineTotal}
                <span className="sr-only"> {t("salon.mineBadge", { count: mineTotal })}</span>
              </span>
            )}
            {key === "mes-tables" && props.replays.length > 0 && (
              <span className="size-2 rounded-full bg-kin">
                <span className="sr-only">{t("salon.replayDot")}</span>
              </span>
            )}
          </Link>
        ))}
      </nav>

      {error && (
        <p role="alert" className="text-sm font-bold text-shu">
          {t(`errors.${error}`)}
        </p>
      )}

      {props.replays.length > 0 && (
        <section aria-labelledby="cf-replays" className="cf-rise flex flex-col gap-2 rounded-card bg-kin/10 p-3 ring-1 ring-kin/50 ring-inset">
          <h2 id="cf-replays" className="flex items-center gap-2 font-title text-base font-extrabold text-kin">
            <Hanko glyph="賭" size={24} />
            {t("replays.title")}
          </h2>
          <ul className="flex flex-col gap-1.5">
            {props.replays.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  {r.opponent &&
                    t.rich("replays.row", {
                      name: r.opponent.username,
                      card: r.creatorCard.name,
                      player: () => <PlayerName name={r.opponent!.username} color={r.opponent!.decor.nameColor} className="font-bold" />,
                    })}
                </span>
                <ButtonLink href={tableHref(r)} prefetch={false} size="sm" variant="primary">
                  {t("replays.watch")}
                </ButtonLink>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "tables" && (
        <>
          <nav
            aria-label={t("salon.filterLabel")}
            className="-mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 [mask-image:linear-gradient(90deg,transparent,#000_12px,#000_calc(100%-36px),transparent)] [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:[mask-image:none]"
          >
            <Link href={salonHref({ tab, tier: null })} prefetch={false} aria-current={tier === null ? "page" : undefined} className={chipClasses(tier === null, "snap-start")}>
              {t("salon.all")}
            </Link>
            {[...tiers].reverse().map((x) => (
              <Link
                key={x.key}
                href={salonHref({ tab, tier: x.key })}
                prefetch={false}
                aria-current={tier === x.key ? "page" : undefined}
                className={chipClasses(tier === x.key, "snap-start")}
              >
                <span aria-hidden="true" lang="ja" className="font-seal">
                  {seals[x.key]}
                </span>
                {x.rarities.map((r) => tRarity(r as "COMMON")).join(" · ")}
              </Link>
            ))}
          </nav>
          {lobby && lobby.items.length > 0 ? (
            <ul className="grid gap-2.5 md:grid-cols-2">
              {lobby.items.map((table) => (
                <TableCard key={table.id} table={table} now={now}>
                  {takeLink(table)}
                </TableCard>
              ))}
            </ul>
          ) : (
            <EmptyState title={tier ? t("salon.empty") : t("salon.emptyAll")} body={t("salon.emptyBody")} onStake={openSheet} />
          )}
          {lobby?.nextCursor && (
            <Button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="self-center">
              {loadingMore ? t("salon.loading") : t("salon.more")}
            </Button>
          )}
        </>
      )}

      {tab === "mes-tables" && props.mine && (
        <>
          {props.mine.invitations.length > 0 && (
            <section aria-labelledby="cf-invitations" className="flex flex-col gap-2">
              <h2 id="cf-invitations" className="font-title text-lg font-extrabold text-hisui">
                {t("mine.invitations")}
              </h2>
              <ul className="grid gap-2.5 md:grid-cols-2">
                {props.mine.invitations.map((table) => (
                  <TableCard key={table.id} table={table} now={now}>
                    <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => decline(table.id)}>
                      {t("mine.decline")}
                    </Button>
                    {takeLink(table)}
                  </TableCard>
                ))}
              </ul>
            </section>
          )}
          <section aria-labelledby="cf-mine" className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <h2 id="cf-mine" className="font-title text-lg font-extrabold">
                {t("mine.open")}
              </h2>
              <span
                className="rounded-pill bg-surface px-2.5 py-0.5 text-xs font-bold text-text-muted ring-1 ring-border ring-inset tabular-nums"
                aria-label={t("mine.countLabel", { count: props.mine.mine.length, max: props.maxOpenTables })}
              >
                {t("mine.count", { count: props.mine.mine.length, max: props.maxOpenTables })}
              </span>
            </div>
            {props.mine.mine.length === 0 ? (
              <EmptyState title={t("mine.none")} body={t("mine.noneBody")} onStake={openSheet} />
            ) : (
              <ul className="grid gap-2.5 md:grid-cols-2">
                {props.mine.mine.map((table) => (
                  <TableCard key={table.id} table={table} now={now}>
                    <ButtonLink href={tableHref(table)} prefetch={false} size="sm">
                      {t("salon.view")}
                    </ButtonLink>
                  </TableCard>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {tab === "historique" && props.history && <History history={props.history} now={now} />}

      {canPlay ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-[var(--mobile-nav-height)] z-30 flex justify-end px-4 lg:hidden">
          <Button type="button" variant="primary" size="lg" className="pointer-events-auto shadow-float" onClick={() => setSheet(true)}>
            ＋ {t("salon.stake")}
          </Button>
        </div>
      ) : (
        <p className="rounded-card bg-surface p-4 text-sm text-text-muted">{t("salon.guest")}</p>
      )}

      {canPlay && (
        <StakeSheet
          open={sheet}
          onClose={() => setSheet(false)}
          allowed={props.allowed}
          expiryHours={props.expiryHours}
          initialReserveFor={props.reserveFor}
          serverNow={props.serverNow}
        />
      )}
    </div>
  );
}

/** Historique : trois tuiles (joués, gagnés, perdus), série et faces, puis les lancers. */
function History({ history, now }: { history: { items: CoinFlipTableView[]; stats: FlipStats }; now: number }) {
  const t = useTranslations("casino.history");
  const format = useFormatter();
  const { stats } = history;
  const tiles = [
    { key: "played", value: stats.played, tone: "text-text" },
    { key: "won", value: stats.won, tone: "text-kin" },
    { key: "lost", value: stats.lost, tone: "text-ai" },
  ] as const;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <dl className="grid grid-cols-3 gap-2">
          {tiles.map((tile) => (
            <div key={tile.key} className="flex flex-col-reverse items-center gap-0.5 rounded-card bg-surface px-2 py-3 ring-1 ring-border/70 ring-inset">
              <dt className="text-xs text-text-muted">{t(`tiles.${tile.key}`)}</dt>
              <dd className={`font-heading text-2xl tabular-nums ${tile.tone}`}>{format.number(tile.value)}</dd>
            </div>
          ))}
        </dl>
        {stats.played > 0 && (
          <p className="text-center text-sm text-text-muted tabular-nums">
            {t("sides", { omote: stats.omote, ura: stats.ura })}
            {stats.streak > 1 && ` · ${t("streakWin", { count: stats.streak })}`}
            {stats.streak < -1 && ` · ${t("streakLoss", { count: -stats.streak })}`}
          </p>
        )}
      </div>
      {history.items.length === 0 ? (
        <p className="rounded-card bg-surface p-5 text-center text-sm text-text-muted">{t("empty")}</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {history.items.map((h) => {
            const other = h.mine ? h.opponent : h.creator;
            const myCard = h.mine ? h.creatorCard : h.opponentCard;
            const won = h.outcome === "won";
            return (
              <li key={h.id}>
                <Link
                  href={`/casino/pile-ou-face/${h.id}`}
                  prefetch={false}
                  className={`flex items-center gap-3 rounded-card bg-surface py-2 pr-3 pl-2 ring-1 ring-inset hover:ring-text-muted/50 ${won ? "ring-kin/40" : "ring-border/60"}`}
                >
                  {myCard && (
                    <span className="w-10 shrink-0">
                      <Fuda card={myCard} size="sm" tilt={false} still />
                    </span>
                  )}
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
                    <b className={won ? "text-kin" : "text-ai"}>{won ? t("won") : t("lost")}</b>
                    <span className="truncate text-xs text-text-muted">
                      {other &&
                        t.rich("against", {
                          name: other.username,
                          player: () => <PlayerName name={other.username} color={other.decor.nameColor} />,
                        })}
                      {h.resolvedAt && ` · ${format.relativeTime(new Date(h.resolvedAt), now)}`}
                    </span>
                  </span>
                  {h.result && (
                    <span className="flex shrink-0 items-center gap-1">
                      <CoinFace side={h.result} size={26} />
                      <span aria-hidden="true" lang="ja" className="font-seal text-sm">
                        {SIDE_KANJI[h.result]}
                      </span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
