"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useRef, useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { salonHref, type SalonTab } from "@/lib/casino/params";
import { SIDE_KANJI } from "@/lib/casino/media";
import type { FlipStats } from "@/lib/casino/view";
import type { Rarity } from "@/lib/catalog/rarity";
import { useRaritySeals } from "@/lib/catalog/use-rarities";
import { coinFlipLobbyAction, declineCoinFlipAction, type CasinoActionError } from "@/server/actions/casino";
import type { CoinFlipTableView, LobbyPage } from "@/server/casino/queries";
import { Fuda } from "../fuda/Fuda";
import { usePoll } from "../realtime/usePoll";
import { PlayerAvatar } from "../social/PlayerAvatar";
import { PlayerName } from "../social/PlayerName";
import { Button } from "../ui/Button";
import { ButtonLink } from "../ui/ButtonLink";
import { chipClasses } from "../ui/Chip";
import { segmentedCompactItemClass, segmentedFillClass, segmentedTrackClass } from "../ui/Segmented";
import { CoinFace } from "./CoinFace";
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
  serverNow: number;
};

/** Ligne d'une table : la fuda misée, le joueur, la face choisie, depuis quand elle attend. */
function TableRow({ table, now, action }: { table: CoinFlipTableView; now: number; action: React.ReactNode }) {
  const t = useTranslations("casino");
  const tRarity = useTranslations("rarity");
  const format = useFormatter();
  const seals = useRaritySeals();
  return (
    <li className="flex items-center gap-3 rounded-card bg-surface py-2 pr-3 pl-2 ring-1 ring-border/60 ring-inset">
      <Link href={`/casino/pile-ou-face/${table.id}`} prefetch={false} className="w-12 shrink-0 rounded-[7px]" aria-label={t("salon.tableOf", { name: table.creator.username })}>
        <Fuda card={table.creatorCard} size="sm" tilt={false} still />
      </Link>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <b className="truncate font-title text-[15px] font-extrabold">{table.creatorCard.name}</b>
        <small className="text-xs text-text-muted">
          <span aria-hidden="true" lang="ja" className="font-seal">
            {seals[table.rarity]}
          </span>{" "}
          {tRarity(table.rarity as "COMMON")}
          {table.forMe && <span className="ml-1.5 rounded-pill bg-hisui/15 px-1.5 text-hisui">{t("salon.reserved")}</span>}
        </small>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-text-muted">
          <PlayerAvatar username={table.creator.username} image={table.creator.image} size={20} frame={table.creator.decor.frame} />
          <PlayerName name={table.creator.username} color={table.creator.decor.nameColor} className="truncate" />
          <span aria-hidden="true">·</span>
          <span className="shrink-0">{format.relativeTime(new Date(table.createdAt), now)}</span>
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-center gap-1.5">
        <span className="flex items-center gap-1 text-xs text-text-muted">
          <CoinFace side={table.creatorSide} size={28} />
          <span className="sr-only">{t("salon.plays", { side: t(`side.${table.creatorSide}`) })}</span>
        </span>
        {action}
      </span>
    </li>
  );
}

/** Salon du pile ou face : tables ouvertes (filtre par palier), mes tables et invitations, historique. */
export function CoinFlipSalon(props: Props) {
  const { tab, tiers, tier, canPlay } = props;
  const t = useTranslations("casino");
  const tRarity = useTranslations("rarity");
  const seals = useRaritySeals();
  const router = useRouter();
  const [now, setNow] = useState(props.serverNow);
  const [lobby, setLobby] = useState(props.lobby);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sheet, setSheet] = useState(props.reserveFor !== null && canPlay);
  const [error, setError] = useState<CasinoActionError | null>(null);
  const [pending, startTransition] = useTransition();
  const tierOrder = tiers.find((x) => x.key === tier)?.order ?? null;
  const shownIds = useRef(props.lobby?.items.map((i) => i.id).join(",") ?? "");

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

  const takeLink = (table: CoinFlipTableView) => (
    <ButtonLink href={`/casino/pile-ou-face/${table.id}`} prefetch={false} size="sm" variant="primary">
      {t("salon.take")}
    </ButtonLink>
  );

  return (
    <div className={`flex flex-col gap-4 ${canPlay ? "pb-20" : ""}`}>
      <div className="flex items-center gap-3">
        <Link href="/casino" prefetch={false} className="text-sm text-text-muted underline-offset-4 hover:underline">
          ‹ {t("salon.back")}
        </Link>
      </div>
      <h1 className="font-title text-2xl font-extrabold md:text-3xl">{t("salon.title")}</h1>

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
          </Link>
        ))}
      </nav>

      {error && (
        <p role="alert" className="text-sm font-bold text-shu">
          {t(`errors.${error}`)}
        </p>
      )}

      {tab === "tables" && (
        <>
          <nav aria-label={t("salon.filterLabel")} className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
            <Link href={salonHref({ tab, tier: null })} prefetch={false} aria-current={tier === null ? "page" : undefined} className={chipClasses(tier === null)}>
              {t("salon.all")}
            </Link>
            {[...tiers].reverse().map((x) => (
              <Link
                key={x.key}
                href={salonHref({ tab, tier: x.key })}
                prefetch={false}
                aria-current={tier === x.key ? "page" : undefined}
                className={chipClasses(tier === x.key)}
              >
                <span aria-hidden="true" lang="ja" className="font-seal">
                  {seals[x.key]}
                </span>
                {x.rarities.map((r) => tRarity(r as "COMMON")).join(" · ")}
              </Link>
            ))}
          </nav>
          {lobby && lobby.items.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {lobby.items.map((table) => (
                <TableRow key={table.id} table={table} now={now} action={takeLink(table)} />
              ))}
            </ul>
          ) : (
            <p className="rounded-card bg-surface p-5 text-center text-sm text-text-muted">{tier ? t("salon.empty") : t("salon.emptyAll")}</p>
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
          <section className="flex flex-col gap-2">
            <h2 className="font-title text-lg font-extrabold">{t("mine.invitations")}</h2>
            {props.mine.invitations.length === 0 ? (
              <p className="text-sm text-text-muted">{t("mine.noInvitation")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {props.mine.invitations.map((table) => (
                  <TableRow
                    key={table.id}
                    table={table}
                    now={now}
                    action={
                      <span className="flex flex-col gap-1">
                        {takeLink(table)}
                        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => decline(table.id)}>
                          {t("mine.decline")}
                        </Button>
                      </span>
                    }
                  />
                ))}
              </ul>
            )}
          </section>
          <section className="flex flex-col gap-2">
            <h2 className="font-title text-lg font-extrabold">{t("mine.open")}</h2>
            {props.mine.mine.length === 0 ? (
              <p className="text-sm text-text-muted">{t("mine.none")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {props.mine.mine.map((table) => (
                  <TableRow
                    key={table.id}
                    table={table}
                    now={now}
                    action={
                      <ButtonLink href={`/casino/pile-ou-face/${table.id}`} prefetch={false} size="sm">
                        {t("salon.view")}
                      </ButtonLink>
                    }
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {tab === "historique" && props.history && <History history={props.history} now={now} />}

      {canPlay ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex justify-end px-4 lg:static lg:justify-start lg:px-0">
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

/** Historique : statistiques puis lancers joués, gagnés ou perdus. */
function History({ history, now }: { history: { items: CoinFlipTableView[]; stats: FlipStats }; now: number }) {
  const t = useTranslations("casino.history");
  const format = useFormatter();
  const { stats } = history;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 rounded-card bg-surface p-4 ring-1 ring-border ring-inset">
        <p className="font-bold tabular-nums">{t("stats", { played: stats.played, won: stats.won, lost: stats.lost })}</p>
        {stats.played > 0 && (
          <p className="text-sm text-text-muted tabular-nums">
            {t("sides", { omote: stats.omote, ura: stats.ura })}
            {stats.streak > 1 && ` · ${t("streakWin", { count: stats.streak })}`}
            {stats.streak < -1 && ` · ${t("streakLoss", { count: -stats.streak })}`}
          </p>
        )}
      </div>
      {history.items.length === 0 ? (
        <p className="text-sm text-text-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {history.items.map((h) => {
            const other = h.mine ? h.opponent : h.creator;
            const myCard = h.mine ? h.creatorCard : h.opponentCard;
            const won = h.outcome === "won";
            return (
              <li key={h.id}>
                <Link
                  href={`/casino/pile-ou-face/${h.id}`}
                  prefetch={false}
                  className="flex items-center gap-3 rounded-card bg-surface py-2 pr-3 pl-2 ring-1 ring-border/60 ring-inset hover:ring-text-muted/50"
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
