"use client";

import { useTranslations } from "next-intl";
import Image from "next/image";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { SEARCH_MAX_LENGTH } from "@/lib/catalog/search";
import { REFERRAL_IMAGES } from "@/lib/referral/assets";
import { ONE_OF_ONE_COPY, VOUCHER_FILTERS, type VoucherFilter, type VoucherKindKey } from "@/lib/referral/vouchers";
import { redeemVoucherAction, voucherCardsAction, type RedeemResult } from "@/server/actions/vouchers";
import type { VoucherCardView, VoucherPage } from "@/server/referral/vouchers";
import { Fuda } from "../fuda/Fuda";
import { Button } from "../ui/Button";
import { ButtonLink } from "../ui/ButtonLink";
import { chipClasses } from "../ui/Chip";
import { inputClass } from "../ui/Field";
import { Sheet } from "../ui/Sheet";

const DEBOUNCE_MS = 300;
type Done = Extract<RedeemResult, { ok: true }>;

/**
 * Choix de la carte d'un bon (maquette « Bons A · Grille ») : recherche, filtres, grille, barre du choix collée en bas,
 * confirmation, puis la carte reçue. Le serveur revérifie tout : bon à ce joueur et pas encore utilisé, Mythique
 * publiée, 1/1 encore libre (une 1/1 prise entre-temps est signalée et la grille la marque).
 */
export function VoucherPicker({ voucherId, kind, initial }: { voucherId: string; kind: VoucherKindKey; initial: VoucherPage }) {
  const t = useTranslations("referralV2.picker");
  const router = useRouter();
  const one = kind === "ONE_OF_ONE";
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<VoucherFilter>("all");
  const [page, setPage] = useState<VoucherPage>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [pick, setPick] = useState<VoucherCardView | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const request = useRef(0);
  const searchId = useId();

  useEffect(() => () => clearTimeout(timer.current), []);

  const load = (query: string, f: VoucherFilter, offset: number) => {
    const id = ++request.current;
    setLoading(true);
    setError(false);
    voucherCardsAction({ voucherId, q: query, filter: f, offset }).then(
      (res) => {
        if (id !== request.current) return;
        setLoading(false);
        if (!res.ok) {
          // Bon déjà utilisé (autre onglet) : la page se remet à jour
          if (res.error === "USED") router.refresh();
          else setError(true);
          return;
        }
        const next = { items: res.items, nextOffset: res.nextOffset, total: res.total };
        setPage((current) => (offset === 0 ? next : { ...next, items: [...current.items, ...next.items] }));
      },
      () => {
        if (id !== request.current) return;
        setLoading(false);
        setError(true);
      },
    );
  };

  const markTaken = (cardId: string) => {
    setPage((current) => ({ ...current, items: current.items.map((c) => (c.cardId === cardId ? { ...c, taken: true } : c)) }));
    setPick((current) => (current && current.cardId === cardId ? { ...current, taken: true } : current));
  };

  const redeem = () => {
    if (!pick) return;
    setFailure(null);
    startTransition(async () => {
      const res = await redeemVoucherAction({ voucherId, cardId: pick.cardId });
      if (res.ok) {
        setConfirming(false);
        setDone(res);
        return;
      }
      if (res.error === "CARD_TAKEN") {
        markTaken(pick.cardId);
        setConfirming(false);
        return;
      }
      setFailure(t(`errors.${res.error === "USED" || res.error === "NOT_MYTHIC" || res.error === "CARD_UNAVAILABLE" || res.error === "RATE_LIMITED" ? res.error : "UNAVAILABLE"}`));
      if (res.error === "USED") router.refresh();
    });
  };

  const filters: Record<VoucherFilter, string> = { all: t("filters.all"), free: one ? t("filters.freeOne") : t("filters.freeMythic"), series: t("filters.series") };
  const pickTaken = one && pick?.taken === true;

  return (
    <div className="flex flex-col gap-4">
      <label htmlFor={searchId} className="sr-only">
        {t("searchLabel")}
      </label>
      <input
        id={searchId}
        type="search"
        value={q}
        maxLength={SEARCH_MAX_LENGTH}
        placeholder={t("searchPlaceholder")}
        autoComplete="off"
        onChange={(e) => {
          const value = e.currentTarget.value;
          setQ(value);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => load(value.trim(), filter, 0), DEBOUNCE_MS);
        }}
        className={inputClass}
      />

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("filtersLabel")}>
        {VOUCHER_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => {
              if (f === filter) return;
              setFilter(f);
              clearTimeout(timer.current);
              load(q.trim(), f, 0);
            }}
            className={chipClasses(filter === f)}
          >
            {filters[f]}
          </button>
        ))}
        <span className="ml-auto text-xs text-text-muted tabular-nums" aria-live="polite">
          {t("count", { count: page.total })}
        </span>
      </div>

      {page.items.length === 0 && !loading && !error ? (
        <p className="lacquer rounded-card p-6 text-center text-sm text-text-muted">{t("empty")}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2.5 md:grid-cols-4 lg:grid-cols-6">
          {page.items.map((card, i) => {
            const picked = pick?.cardId === card.cardId;
            const taken = one && card.taken;
            const owned = !one && card.owned;
            return (
              <li key={card.cardId} className="min-w-0">
                <button
                  type="button"
                  aria-pressed={picked}
                  onClick={() => {
                    setFailure(null);
                    setPick(picked ? null : card);
                  }}
                  className="relative block w-full rounded-fuda text-left outline-offset-3 transition-transform active:scale-[0.97] aria-pressed:outline-3 aria-pressed:outline-kin motion-reduce:transition-none"
                >
                  <span className={`block ${taken ? "brightness-60 grayscale" : ""}`}>
                    <Fuda card={card} series={card.series} size="sm" tilt={false} still preload={i < 3} />
                  </span>
                  <span className="sr-only">{[card.name, taken ? t("taken") : owned ? t("owned") : ""].filter(Boolean).join(" · ")}</span>
                  {(taken || owned) && (
                    <span
                      aria-hidden="true"
                      className={`absolute top-[6%] right-[6%] z-10 rounded-pill px-1.5 py-px text-[10px] font-bold ${taken ? "bg-shu-btn text-washi-paper" : "bg-[rgb(21_18_15/0.78)] text-[#f1e9da]"}`}
                    >
                      {taken ? t("taken") : t("owned")}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div aria-live="polite" className="flex justify-center">
        {loading && <p className="text-sm text-text-muted">{t("loading")}</p>}
        {error && (
          <Button type="button" onClick={() => load(q.trim(), filter, page.items.length === 0 ? 0 : (page.nextOffset ?? 0))}>
            {t("retry")}
          </Button>
        )}
        {!loading && !error && page.nextOffset !== null && page.items.length > 0 && (
          <Button type="button" onClick={() => load(q.trim(), filter, page.nextOffset ?? 0)}>
            {t("more")}
          </Button>
        )}
      </div>

      {pick && (
        <div
          role="status"
          className="sticky bottom-[calc(var(--mobile-nav-height)+0.5rem)] z-20 grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-card border border-border bg-surface p-2.5 shadow-float md:mx-auto md:w-lg lg:bottom-4"
        >
          {pickTaken ? (
            <span aria-hidden="true" className="flex size-11 items-center justify-center rounded-sm bg-shu-btn font-heading text-xl text-washi-paper">
              !
            </span>
          ) : (
            <span aria-hidden="true" className="block w-11">
              <Fuda card={pick} series={pick.series} size="sm" tilt={false} still sizes="44px" />
            </span>
          )}
          <span className="flex min-w-0 flex-col">
            <b className="truncate font-title text-sm">{pickTaken ? t("bar.takenTitle", { name: pick.name }) : pick.name}</b>
            <span className="text-xs text-text-muted">
              {pickTaken ? t("bar.takenBody") : one ? t("bar.free") : pick.owned ? t("bar.double") : t("bar.missing")}
            </span>
          </span>
          {!pickTaken && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setFailure(null);
                setConfirming(true);
              }}
            >
              {t("bar.choose")}
            </Button>
          )}
        </div>
      )}

      <Sheet open={confirming && pick !== null} onClose={() => setConfirming(false)} title={t("confirm.label")}>
        {pick && (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="relative w-32">
              <Fuda card={{ ...pick, copy: one ? ONE_OF_ONE_COPY : null }} series={pick.series} size="md" tilt={false} sizes="128px" />
              {/* Sceau rond de l'édition 1/1 (PV2-HANKO11) : l'image est l'anneau, « 1/1 » est écrit au centre */}
              {one && (
                <span aria-hidden="true" className="pointer-events-none absolute -top-3 -right-5 flex size-14 rotate-12 items-center justify-center rounded-full bg-washi-paper/85 drop-shadow-[0_2px_3px_rgb(0_0_0/0.35)]">
                  <Image src={REFERRAL_IMAGES.hanko11.src} alt="" width={56} height={56} className="absolute inset-0 size-full" />
                  <b className="relative font-title text-sm font-extrabold text-[#b3261e] tabular-nums">1/1</b>
                </span>
              )}
            </div>
            <h3 className="font-title text-lg font-extrabold">{one ? t("confirm.titleOne", { name: pick.name }) : t("confirm.title", { name: pick.name })}</h3>
            <p className="text-xs text-text-muted">{t("confirm.final")}</p>
            {failure && (
              <p role="alert" className="text-sm font-bold text-shu">
                {failure}
              </p>
            )}
            <div className="grid w-full grid-cols-2 gap-2">
              <Button type="button" onClick={() => setConfirming(false)} disabled={pending}>
                {t("confirm.cancel")}
              </Button>
              <Button type="button" variant="primary" onClick={redeem} disabled={pending}>
                {pending ? t("confirm.pending") : t("confirm.take")}
              </Button>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet
        open={done !== null}
        onClose={() => {
          setDone(null);
          setPick(null);
          router.refresh();
        }}
        title={t("done.title")}
      >
        {done && (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-36">
              <Fuda card={done.card} series={done.card.series} size="md" sizes="144px" />
            </div>
            <p className="text-sm">
              <b>{t("done.body", { name: done.card.name })}</b>
              {done.isNew && <span className="block text-xs text-kin">{t("done.new")}</span>}
            </p>
            <div className="grid w-full grid-cols-2 gap-2">
              <ButtonLink href="/collection">{t("done.collection")}</ButtonLink>
              {/* Fermer la fenêtre suffit : onClose remet la page à jour */}
              <Button type="button" variant="primary" onClick={() => setDone(null)}>
                {t("done.continue")}
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
