"use client";

import dynamic from "next/dynamic";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import type { OpenedCardView } from "@/lib/boosters/view";
import { otherSide } from "@/lib/casino/fairness";
import { CASINO_MEDIA, SIDE_KANJI } from "@/lib/casino/media";
import type { CollectionItem } from "@/lib/collection/view";
import { useRaritySeals } from "@/lib/catalog/use-rarities";
import {
  cancelCoinFlipAction,
  coinFlipTableAction,
  joinCoinFlipAction,
  markCoinFlipsSeenAction,
  type CasinoActionError,
} from "@/server/actions/casino";
import type { CoinFlipTableView } from "@/server/casino/queries";
import { CardPickGrid } from "../collection/CardPickGrid";
import { CopyPicker } from "../collection/CopyPicker";
import { hasSpecialCopy } from "@/lib/collection/copies";
import { Fuda } from "../fuda/Fuda";
import { useHoldAwake } from "../realtime/activity";
import { useRealtime } from "../realtime/RealtimeProvider";
import { usePoll } from "../realtime/usePoll";
import { PlayerName } from "../social/PlayerName";
import { Button } from "../ui/Button";
import { ButtonLink } from "../ui/ButtonLink";
import { CoinFace } from "./CoinFace";
import { Hanko } from "./Hanko";
import type { StageSeat } from "./CoinFlipStage";
import { VerifySheet } from "./VerifySheet";

// La scène du lancer (Web Animations, vidéo de la salle) n'est chargée qu'au moment de jouer
const CoinFlipStage = dynamic(() => import("./CoinFlipStage").then((m) => m.CoinFlipStage), { ssr: false });

type Props = {
  initial: CoinFlipTableView;
  viewerId: string | null;
  /** Le lecteur peut relever cette table (compte inscrit, jeu ouvert, ni la sienne ni réservée à un autre). */
  canJoin: boolean;
  /** Pourquoi il ne peut pas (message affiché à la place du choix de carte). */
  joinBlock: CasinoActionError | null;
  /** Raretés misables pour relever (le palier de la table). */
  joinRarities: string[];
  pollSeconds: number;
  serverNow: number;
};

type Throw = { table: CoinFlipTableView; prize: OpenedCardView | null; won: boolean };

/**
 * Page d'une table : attente (vue du créateur), relève (vue des autres), lancer animé, puis résultat et
 * vérification. Le créateur qui attend voit sa table relevée en direct (temps réel, sondage en secours) ; s'il
 * était absent, le lancer se rejoue à son retour.
 */
export function CoinFlipTable({ initial, viewerId, canJoin, joinBlock, joinRarities, pollSeconds, serverNow }: Props) {
  const t = useTranslations("casino");
  const router = useRouter();
  const [table, setTable] = useState(initial);
  const [now, setNow] = useState(serverNow);
  const [playing, setPlaying] = useState<Throw | null>(() =>
    initial.status === "DONE" && initial.replayPending ? { table: initial, prize: null, won: initial.outcome === "won" } : null,
  );
  const [verifying, setVerifying] = useState(false);
  const waiting = table.status === "OPEN" && table.mine;
  useHoldAwake(waiting);

  // Le créateur qui attend : sa table relevée arrive par le temps réel, le sondage rattrape sinon
  const poll = useCallback(async () => {
    setNow(Date.now());
    const res = await coinFlipTableAction({ flipId: initial.id });
    if (!res.ok) return false;
    const changed = res.table.status !== table.status;
    setTable(res.table);
    if (res.table.status === "DONE" && res.table.replayPending) setPlaying({ table: res.table, prize: null, won: res.table.outcome === "won" });
    return changed;
  }, [initial.id, table.status]);
  const pollNow = usePoll(poll, { seconds: pollSeconds, realtimeSeconds: pollSeconds * 6, enabled: waiting, channel: "user" });
  const { subscribe } = useRealtime();
  useEffect(() => {
    if (!waiting) return;
    return subscribe("user", "coinflip", (data) => {
      if ((data as { flipId?: string } | null)?.flipId === initial.id) void pollNow();
    });
  }, [initial.id, pollNow, subscribe, waiting]);

  const settled = useCallback(() => {
    // Le créateur a vu son lancer : il ne se rejouera plus
    if (playing && playing.table.mine) void markCoinFlipsSeenAction({ flipIds: [playing.table.id] }).catch(() => undefined);
  }, [playing]);

  const close = () => {
    if (playing) setTable(playing.table);
    setPlaying(null);
    router.refresh();
  };

  // La graine n'arrive qu'avec une table jouée : celle du lancer en cours, sinon celle de la page
  const proof = playing?.table ?? table;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/casino/pile-ou-face" prefetch={false} className="self-start text-sm text-text-muted underline-offset-4 hover:underline">
        ‹ {t("salon.title")}
      </Link>

      {table.status === "OPEN" && table.mine && <Waiting table={table} now={now} />}
      {table.status === "OPEN" && !table.mine && (
        <Join table={table} canJoin={canJoin} joinBlock={joinBlock} rarities={joinRarities} onThrow={(th) => setPlaying(th)} onStale={(next) => next && setTable(next)} />
      )}
      {table.status === "DONE" && !playing && <Result table={table} onVerify={() => setVerifying(true)} />}
      {(table.status === "CANCELLED" || table.status === "EXPIRED") && <Closed table={table} />}

      {playing && viewerId && <Throwing play={playing} onSettled={settled} onClose={close} onVerify={() => setVerifying(true)} />}

      {proof.status === "DONE" && proof.seed && proof.result && (
        <VerifySheet open={verifying} onClose={() => setVerifying(false)} flipId={proof.id} seed={proof.seed} seedHash={proof.seedHash} result={proof.result} />
      )}
    </div>
  );
}

/** Pastille du palier de la table : sceau et nom de la rareté du pot. */
function TierPill({ rarity }: { rarity: string }) {
  const tRarity = useTranslations("rarity");
  const seals = useRaritySeals();
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface px-2.5 py-0.5 text-xs font-bold ring-1 ring-border ring-inset">
      <span aria-hidden="true" lang="ja" className="font-seal text-sm">
        {seals[rarity]}
      </span>
      {tRarity(rarity as "COMMON")}
    </span>
  );
}

/** Vue du créateur : sa fuda sur le plateau, la place d'en face qui attend, l'invitation et le retrait. */
function Waiting({ table, now }: { table: CoinFlipTableView; now: number }) {
  const t = useTranslations("casino.table");
  const tSide = useTranslations("casino.side");
  const tErrors = useTranslations("casino.errors");
  const format = useFormatter();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<CasinoActionError | null>(null);
  const [pending, startTransition] = useTransition();

  const invite = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: t("shareTitle"), url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      }
    } catch {
      // Partage annulé par le joueur : rien à signaler
    }
  };

  const cancel = () =>
    startTransition(async () => {
      const res = await cancelCoinFlipAction({ flipId: table.id });
      if (res.ok) router.push("/casino/pile-ou-face?onglet=mes-tables");
      else setError(res.error);
    });

  return (
    <section className="flex flex-col items-center gap-4 text-center">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <h1 className="font-title text-2xl font-extrabold">{t("yourTable")}</h1>
        <span className="rounded-pill bg-hisui/15 px-2.5 py-0.5 text-xs font-bold text-hisui ring-1 ring-hisui/40 ring-inset">{t("open")}</span>
        <TierPill rarity={table.rarity} />
      </div>
      <p className="text-sm text-text-muted">{t("expires", { time: format.relativeTime(new Date(table.expiresAt), now) })}</p>
      {table.reservedFor && (
        <p className="text-sm">
          {t.rich("reservedFor", {
            name: table.reservedFor.username,
            player: () => <PlayerName name={table.reservedFor!.username} color={table.reservedFor!.decor.nameColor} className="font-bold" />,
          })}
        </p>
      )}

      <div className="relative h-82 w-62 bg-[length:100%_100%] bg-center drop-shadow-[0_24px_30px_rgb(0_0_0/0.55)]" style={{ backgroundImage: `url(${CASINO_MEDIA.tray})` }}>
        <span className="absolute top-6 left-1/2 grid h-32 w-23 -translate-x-1/2 place-items-center rounded-[9px] border-[1.5px] border-dashed border-kin/60 px-1 text-xs leading-tight text-text/75 motion-safe:animate-pulse">
          {t("awaiting")}
        </span>
        <CoinFace side={table.creatorSide} size={42} className="absolute top-1/2 left-1/2 -translate-1/2" />
        <span className="absolute bottom-6 left-1/2 w-23 -translate-x-1/2">
          <Fuda card={table.creatorCard} size="sm" tilt={false} still />
        </span>
      </div>

      <p className="max-w-xs text-sm text-text/80">
        {t("youPlayWith", { side: SIDE_KANJI[table.creatorSide], sideName: tSide(table.creatorSide), card: table.creatorCard.name })}
      </p>
      <div className="grid w-full max-w-sm grid-cols-2 gap-2.5">
        <Button type="button" onClick={() => void invite()}>
          {copied ? t("copied") : t("invite")}
        </Button>
        {confirming ? (
          <Button type="button" variant="danger" disabled={pending} onClick={cancel}>
            {t("confirmCancel")}
          </Button>
        ) : (
          <Button type="button" onClick={() => setConfirming(true)}>
            {t("cancel")}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm font-bold text-shu">
          {tErrors(error)}
        </p>
      )}
      <p className="max-w-xs text-xs text-text-muted">{t("leaveOk")}</p>
    </section>
  );
}

/** Vue d'un autre joueur : sa fuda en grand, la face qui reste, puis une fuda du même palier à miser. */
function Join({
  table,
  canJoin,
  joinBlock,
  rarities,
  onThrow,
  onStale,
}: {
  table: CoinFlipTableView;
  canJoin: boolean;
  joinBlock: CasinoActionError | null;
  rarities: string[];
  onThrow: (th: Throw) => void;
  onStale: (table: CoinFlipTableView | null) => void;
}) {
  const t = useTranslations("casino.table");
  const tStake = useTranslations("casino.stake");
  const tErrors = useTranslations("casino.errors");
  const tRarity = useTranslations("rarity");
  const seals = useRaritySeals();
  const mySide = otherSide(table.creatorSide);
  const [card, setCard] = useState<CollectionItem | null>(null);
  // Exemplaire désigné : une pièce spéciale ne se mise que choisie
  const [copyId, setCopyId] = useState<string | null>(null);
  const [confirmLast, setConfirmLast] = useState(false);
  const [serverSaysLast, setServerSaysLast] = useState(false);
  const [error, setError] = useState<CasinoActionError | null>(null);
  const [pending, startTransition] = useTransition();
  const lastCopy = card !== null && (card.copies <= 1 || serverSaysLast);
  const sending = useRef(false);

  const go = () =>
    startTransition(async () => {
      if (!card || sending.current) return;
      sending.current = true;
      try {
        const res = await joinCoinFlipAction({ flipId: table.id, cardId: card.cardId, userCardId: copyId, confirmLastCopy: lastCopy && confirmLast });
        if (res.ok) {
          onThrow({ table: res.table, prize: res.prize, won: res.won });
          return;
        }
        if (res.error === "CONFIRM_LAST_COPY") {
          setServerSaysLast(true);
          setConfirmLast(false);
        }
        if (res.error === "NOT_OPEN") {
          const fresh = await coinFlipTableAction({ flipId: table.id });
          onStale(fresh.ok ? fresh.table : null);
        }
        setError(res.error);
      } catch {
        setError("UNAVAILABLE");
      } finally {
        sending.current = false;
      }
    });

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <h1 className="font-title text-2xl font-extrabold">{t("tableOf", { name: table.creator.username })}</h1>
          <TierPill rarity={table.rarity} />
        </div>
        <p className="text-sm text-text-muted">{t("stakes", { name: table.creator.username })}</p>
        <div className="w-40 drop-shadow-[0_18px_40px_rgb(0_0_0/0.55)]">
          <Fuda card={table.creatorCard} size="md" />
        </div>
        <div className="flex flex-wrap justify-center gap-2 text-sm">
          <span className="flex items-center gap-2 rounded-pill bg-surface py-1 pr-3 pl-1 ring-1 ring-border ring-inset">
            <CoinFace side={table.creatorSide} size={28} />
            {t("theyPlay", { name: table.creator.username, side: SIDE_KANJI[table.creatorSide] })}
          </span>
          <span className="flex items-center gap-2 rounded-pill bg-surface py-1 pr-3 pl-1 ring-2 ring-kin ring-inset">
            <CoinFace side={mySide} size={28} />
            {t("youPlay", { side: SIDE_KANJI[mySide] })}
          </span>
        </div>
        {table.forMe && <p className="text-sm text-hisui">{t("forYou")}</p>}
      </div>

      {canJoin ? (
        <div className="flex flex-col gap-3 rounded-hero bg-surface p-4 ring-1 ring-border ring-inset">
          <p className="flex items-center gap-2 text-sm font-bold">
            <span aria-hidden="true" lang="ja" className="font-seal">
              {seals[table.rarity]}
            </span>
            {t("pickTier", { tier: rarities.map((r) => tRarity(r as "COMMON")).join(" · ") })}
          </p>
          <CardPickGrid
            selected={new Set(card ? [card.cardId] : [])}
            onPick={(item) => {
              setCard((c) => (c?.cardId === item.cardId ? null : item));
              setCopyId(null);
              setConfirmLast(false);
              setServerSaysLast(false);
              setError(null);
            }}
            pickLabel={(name) => tStake("pickLabel", { name })}
            unavailable={(item) => item.free === 0}
            allowed={rarities}
          />
          {card && <CopyPicker cardId={card.cardId} special={hasSpecialCopy(card)} value={copyId} onChange={setCopyId} />}
          {/* La mise choisie et « Lancer la pièce » restent sous le pouce, au-dessus de la navigation */}
          <div className="sticky bottom-[calc(var(--mobile-nav-height)+0.5rem)] z-20 -mx-2 flex flex-col gap-3 rounded-card bg-surface/95 p-2 shadow-float ring-1 ring-border ring-inset lg:bottom-4">
            {card && (
              <div className="flex items-center gap-3 rounded-card bg-bg/60 p-2 ring-1 ring-border ring-inset">
                <span className="w-10 shrink-0">
                  <Fuda card={card} size="sm" tilt={false} still />
                </span>
                <Hanko glyph="対" size={30} />
                <span className="w-10 shrink-0">
                  <Fuda card={table.creatorCard} size="sm" tilt={false} still />
                </span>
                <span className="flex min-w-0 flex-col text-xs text-text-muted">
                  <b className="truncate font-title text-sm text-text">{card.name}</b>
                  {t("against", { card: table.creatorCard.name })}
                </span>
              </div>
            )}
            {lastCopy && card && (
              <>
                <p className="rounded-control bg-shu/15 px-3 py-2 text-sm text-[#F4C7BE] ring-1 ring-shu/50 ring-inset">{tStake("lastCopy", { card: card.name })}</p>
                <label className="flex min-h-11 items-center gap-2 text-sm font-bold">
                  <input type="checkbox" className="choice" checked={confirmLast} onChange={(e) => setConfirmLast(e.target.checked)} />
                  {tStake("confirmLast")}
                </label>
              </>
            )}
            {error && (
              <p role="alert" className="text-sm font-bold text-shu">
                {tErrors(error)}
              </p>
            )}
            <Button type="button" variant="primary" size="lg" className="w-full" disabled={!card || (lastCopy && !confirmLast) || pending} onClick={go}>
              {pending ? t("flipping") : t("flip")}
            </Button>
          </div>
        </div>
      ) : (
        <p className="rounded-card bg-surface p-4 text-center text-sm text-text-muted">{tErrors(joinBlock ?? "UNAVAILABLE")}</p>
      )}
    </section>
  );
}

/** Le lancer en plein écran, puis la tablette du résultat. */
function Throwing({ play, onSettled, onClose, onVerify }: { play: Throw; onSettled: () => void; onClose: () => void; onVerify: () => void }) {
  const t = useTranslations("casino.table");
  const tRarity = useTranslations("rarity");
  const { table } = play;
  if (!table.opponent || !table.opponentCard || !table.result) return null;
  const creator: StageSeat = { player: table.creator, card: table.creatorCard, side: table.creatorSide, you: table.mine };
  const opponent: StageSeat = { player: table.opponent, card: table.opponentCard, side: otherSide(table.creatorSide), you: !table.mine };
  const [bottom, top] = table.mine ? [creator, opponent] : [opponent, creator];
  const won = table.result === bottom.side;
  // Le gagnant reçoit la fuda d'en face ; le perdant voit partir la sienne
  const shown = won ? top.card : bottom.card;
  const isNew = play.prize?.isNew ?? table.winnerNew;

  const tablet = (
    <>
      <div className="flex items-center gap-3">
        <span className="w-14 shrink-0">
          <Fuda card={shown} size="sm" tilt={false} still />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <b className="font-title text-base leading-snug font-extrabold">
            {won ? t("youWin", { card: shown.name }) : t("youLose", { card: shown.name, name: top.player.username })}
          </b>
          <small className="text-xs text-text-muted">
            {tRarity(table.rarity as "COMMON")} · {won ? t("joinsCollection") : t("landedOn", { side: SIDE_KANJI[table.result] })}
          </small>
          {won && isNew && <span className="self-start rounded-pill bg-shu-btn px-2 text-xs font-bold text-washi-paper">{t("new")}</span>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ButtonLink href={`/casino/pile-ou-face?revanche=${table.id}`} prefetch={false} variant={won ? "secondary" : "primary"}>
          {t("rematch")}
        </ButtonLink>
        <ButtonLink href="/casino/pile-ou-face" prefetch={false} variant={won ? "primary" : "secondary"}>
          {t("again")}
        </ButtonLink>
      </div>
      <div className="flex justify-between gap-2">
        <button type="button" onClick={onVerify} className="min-h-11 text-sm text-kin underline underline-offset-4">
          {t("verify")}
        </button>
        <button type="button" onClick={onClose} className="min-h-11 text-sm text-text-muted underline underline-offset-4">
          {t("close")}
        </button>
      </div>
    </>
  );

  return (
    <CoinFlipStage
      flipId={table.id}
      top={top}
      bottom={bottom}
      result={table.result}
      rarity={table.rarity}
      title={table.mine ? t("yourTable") : t("tableOf", { name: table.creator.username })}
      outroLabel={won ? t("outroWin") : t("outroLose", { name: top.player.username })}
      tablet={tablet}
      onSettled={onSettled}
    />
  );
}

/** Table jouée, vue après coup (ou par un spectateur) : les deux fuda, la face sortie, la vérification. */
function Result({ table, onVerify }: { table: CoinFlipTableView; onVerify: () => void }) {
  const t = useTranslations("casino.table");
  if (!table.opponent || !table.opponentCard || !table.result) return null;
  const creatorWon = table.winnerId === table.creatorId;
  const winner = creatorWon ? table.creator : table.opponent;
  const prize = creatorWon ? table.opponentCard : table.creatorCard;
  const participant = table.outcome !== null;
  return (
    <section className="flex flex-col items-center gap-4 text-center">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <h1 className="font-title text-2xl font-extrabold">{table.mine ? t("yourTable") : t("tableOf", { name: table.creator.username })}</h1>
        <TierPill rarity={table.rarity} />
      </div>
      <div className="flex items-center gap-3">
        <div className={`flex w-28 flex-col items-center gap-1 ${creatorWon ? "" : "opacity-60"}`}>
          <Fuda card={table.creatorCard} size="sm" tilt={false} still />
          <span className="flex items-center gap-1 text-xs">
            <CoinFace side={table.creatorSide} size={20} />
            <PlayerName name={table.creator.username} color={table.creator.decor.nameColor} className="truncate" />
          </span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <CoinFace side={table.result} size={56} />
          <span aria-hidden="true" lang="ja" className="font-seal text-2xl">
            {SIDE_KANJI[table.result]}
          </span>
        </div>
        <div className={`flex w-28 flex-col items-center gap-1 ${creatorWon ? "opacity-60" : ""}`}>
          <Fuda card={table.opponentCard} size="sm" tilt={false} still />
          <span className="flex items-center gap-1 text-xs">
            <CoinFace side={otherSide(table.creatorSide)} size={20} />
            <PlayerName name={table.opponent.username} color={table.opponent.decor.nameColor} className="truncate" />
          </span>
        </div>
      </div>
      <p className="font-heading text-xl">
        {table.outcome === "won" ? t("resultWon") : table.outcome === "lost" ? t("resultLost") : t("resultSpectator", { name: winner.username, card: prize.name })}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {participant && (
          <ButtonLink href={`/casino/pile-ou-face?revanche=${table.id}`} prefetch={false} variant="primary">
            {t("rematch")}
          </ButtonLink>
        )}
        <ButtonLink href="/casino/pile-ou-face" prefetch={false}>
          {t("again")}
        </ButtonLink>
        <Button type="button" variant="ghost" onClick={onVerify}>
          {t("verify")}
        </Button>
      </div>
    </section>
  );
}

/** Table retirée ou expirée : la carte est revenue à son créateur. */
function Closed({ table }: { table: CoinFlipTableView }) {
  const t = useTranslations("casino.table");
  return (
    <section className="flex flex-col items-center gap-3 text-center">
      <h1 className="font-title text-2xl font-extrabold">{table.mine ? t("yourTable") : t("tableOf", { name: table.creator.username })}</h1>
      <p className="text-sm text-text-muted">{table.status === "EXPIRED" ? t("expired") : t("cancelled")}</p>
      <ButtonLink href="/casino/pile-ou-face" prefetch={false} variant="primary">
        {t("again")}
      </ButtonLink>
    </section>
  );
}
