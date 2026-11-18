"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import type { CoinSide } from "@/lib/casino/fairness";
import { SIDE_KANJI } from "@/lib/casino/media";
import type { Rarity } from "@/lib/catalog/rarity";
import type { CollectionItem } from "@/lib/collection/view";
import { USERNAME_REGEX } from "@/lib/username";
import { createCoinFlipAction, type CasinoActionError } from "@/server/actions/casino";
import { CardPickGrid } from "../collection/CardPickGrid";
import { Button } from "../ui/Button";
import { inputClass } from "../ui/Field";
import { segmentedCompactItemClass, segmentedFillClass, segmentedTrackClass } from "../ui/Segmented";
import { Sheet } from "../ui/Sheet";
import { CoinFace } from "./CoinFace";
import { Hanko } from "./Hanko";

const SIDES: CoinSide[] = ["OMOTE", "URA"];

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-sm font-bold text-text-muted">
      <span aria-hidden="true" className="grid size-5 place-items-center rounded-full bg-surface-2 text-xs text-kin ring-1 ring-border ring-inset">
        {n}
      </span>
      {children}
    </p>
  );
}

/**
 * Poser une carte : la fuda (avertissement net si c'est le dernier exemplaire), la face 表 ou 裏, puis table
 * ouverte à tous ou réservée à un joueur. Le serveur choisit l'exemplaire et revérifie tout sous verrou.
 */
export function StakeSheet({
  open,
  onClose,
  allowed,
  expiryHours,
  initialReserveFor,
  serverNow,
}: {
  open: boolean;
  onClose: () => void;
  /** Raretés jouables. */
  allowed: readonly Rarity[];
  expiryHours: number;
  /** Pseudo d'un ami ou d'un ancien adversaire (lien « Revanche » ou « Inviter »). */
  initialReserveFor: string | null;
  serverNow: number;
}) {
  const t = useTranslations("casino");
  const format = useFormatter();
  const router = useRouter();
  const friendId = useId();
  const [card, setCard] = useState<CollectionItem | null>(null);
  const [side, setSide] = useState<CoinSide | null>(null);
  const [reserved, setReserved] = useState(initialReserveFor !== null);
  const [username, setUsername] = useState(initialReserveFor ?? "");
  const [confirmLast, setConfirmLast] = useState(false);
  // Le serveur peut trouver d'autres exemplaires déjà en jeu : le dernier n'est alors connu qu'à la réponse
  const [serverSaysLast, setServerSaysLast] = useState(false);
  const [error, setError] = useState<CasinoActionError | null>(null);
  const [pending, startTransition] = useTransition();

  const lastCopy = card !== null && (card.copies <= 1 || serverSaysLast);
  const reserveValid = !reserved || USERNAME_REGEX.test(username.trim());
  const ready = card !== null && side !== null && reserveValid && (!lastCopy || confirmLast);
  const backAt = new Date(serverNow + expiryHours * 3_600_000);

  const pick = (item: CollectionItem) => {
    setCard((current) => (current?.cardId === item.cardId ? null : item));
    setConfirmLast(false);
    setServerSaysLast(false);
    setError(null);
  };

  const submit = () =>
    startTransition(async () => {
      if (!card || !side) return;
      try {
        const res = await createCoinFlipAction({
          cardId: card.cardId,
          side,
          reservedFor: reserved ? username.trim() : null,
          confirmLastCopy: lastCopy && confirmLast,
        });
        if (res.ok) {
          onClose();
          router.push(`/casino/pile-ou-face/${res.flipId}`);
          return;
        }
        if (res.error === "CONFIRM_LAST_COPY") {
          setServerSaysLast(true);
          setConfirmLast(false);
        }
        setError(res.error);
      } catch {
        setError("UNAVAILABLE");
      }
    });

  return (
    <Sheet open={open} onClose={onClose} title={t("stake.title")} wide>
      <div className="flex flex-col gap-4">
        <Step n={1}>{t("stake.step1")}</Step>
        <CardPickGrid
          selected={new Set(card ? [card.cardId] : [])}
          onPick={pick}
          pickLabel={(name) => t("stake.pickLabel", { name })}
          unavailable={(item) => item.free === 0}
          allowed={allowed}
        />
        <div
          aria-live="polite"
          className={`flex min-h-12 items-center gap-2.5 rounded-control px-3 py-2 text-sm ${
            lastCopy ? "bg-shu/15 text-[#F4C7BE] ring-1 ring-shu/50 ring-inset" : "bg-surface text-text-muted ring-1 ring-border ring-inset"
          }`}
        >
          <Hanko glyph={lastCopy ? "封" : "札"} size={24} />
          <span>
            {card === null
              ? t("stake.hint")
              : lastCopy
                ? t("stake.lastCopy", { card: card.name })
                : t("stake.remaining", { card: card.name, count: card.copies - 1 })}
          </span>
        </div>
        {lastCopy && (
          <label className="flex min-h-11 items-center gap-2 text-sm font-bold">
            <input type="checkbox" className="choice" checked={confirmLast} onChange={(e) => setConfirmLast(e.target.checked)} />
            {t("stake.confirmLast")}
          </label>
        )}

        <Step n={2}>{t("stake.step2")}</Step>
        <div role="radiogroup" aria-label={t("stake.step2")} className="grid grid-cols-2 gap-2.5">
          {SIDES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={side === s}
              onClick={() => setSide(s)}
              className="flex min-h-14 items-center gap-2.5 rounded-card bg-surface px-3 py-2 text-left ring-1 ring-border ring-inset transition-[background-color,box-shadow] aria-checked:bg-kin/10 aria-checked:ring-2 aria-checked:ring-kin motion-reduce:transition-none"
            >
              <CoinFace side={s} size={40} />
              <span className="flex flex-col leading-tight">
                <b className="text-sm">
                  <span lang="ja" className="font-seal">
                    {SIDE_KANJI[s]}
                  </span>{" "}
                  {t(`side.${s}`)}
                </b>
                <small className="text-xs text-text-muted">{t(s === "OMOTE" ? "stake.omoteNote" : "stake.uraNote")}</small>
              </span>
            </button>
          ))}
        </div>

        <Step n={3}>{t("stake.step3")}</Step>
        <div className={`${segmentedTrackClass} ${segmentedFillClass}`}>
          <button type="button" aria-pressed={!reserved} onClick={() => setReserved(false)} className={segmentedCompactItemClass}>
            {t("stake.everyone")}
          </button>
          <button type="button" aria-pressed={reserved} onClick={() => setReserved(true)} className={segmentedCompactItemClass}>
            {t("stake.friend")}
          </button>
        </div>
        {reserved && (
          <div className="flex flex-col gap-1">
            <label htmlFor={friendId} className="text-sm">
              {t("stake.friendLabel")}
            </label>
            <input
              id={friendId}
              value={username}
              maxLength={20}
              autoComplete="off"
              aria-invalid={!reserveValid || undefined}
              onChange={(e) => {
                setUsername(e.target.value);
                setError(null);
              }}
              className={inputClass}
            />
          </div>
        )}

        {/* Récapitulatif et bouton collés en bas de la feuille : visibles sans redescendre la grille */}
        <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-border bg-bg px-4 pt-3 md:-mx-6 md:px-6">
          <p className="text-sm text-text-muted">
            {card && side
              ? t("stake.recap", { card: card.name, date: format.dateTime(backAt, { weekday: "long", hour: "2-digit", minute: "2-digit" }) })
              : t("stake.recapEmpty")}
          </p>
          {error && (
            <p role="alert" className="text-sm font-bold text-shu">
              {t(`errors.${error}`)}
            </p>
          )}
          <Button type="button" variant="primary" size="lg" disabled={!ready || pending} onClick={submit} className="w-full">
            {pending ? t("stake.posting") : t("stake.submit")}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
