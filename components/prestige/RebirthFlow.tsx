"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import type { CollectionItem } from "@/lib/collection/view";
import type { FrameStyle } from "@/lib/profile/frames";
import { previewRebirthAction, rebirthAction, type PrestigeActionError, type RebirthPreviewView, type RebirthResultView } from "@/server/actions/prestige";
import type { SpecialCopyView } from "@/server/prestige/queries";
import { CardPickGrid } from "../collection/CardPickGrid";
import { Fuda } from "../fuda/Fuda";
import { useReducedFx } from "../motion/MotionPreference";
import { Button } from "../ui/Button";
import { HoldButton } from "../ui/HoldButton";
import { RiteDialog } from "./RiteDialog";

// Rites chargés à la demande : ils ne pèsent rien tant que le joueur ne renaît pas
const RebirthRite = dynamic(() => import("./RebirthRite").then((m) => m.RebirthRite), { ssr: false });
const RebirthCinematic = dynamic(() => import("./RebirthCinematic").then((m) => m.RebirthCinematic), { ssr: false });

/** Rite joué après la renaissance (prestige.riteStyle) : bain d'encre ou cinématique de lumière. */
export type RiteStyle = "INK" | "CINEMATIC";

/** Rareté telle que l'affichent les jauges et le rite. */
export type RarityInfo = { key: string; seal: string; name: string; color: string };

/** Cartes parties, par rareté et dans l'ordre du registre (récapitulatif et piles du rite) ; les raretés vides ne comptent pas. */
export function departedByRarity(rarities: readonly RarityInfo[], departed: readonly { rarity: string; count: number }[]) {
  return rarities
    .map((r) => ({ ...r, count: departed.filter((d) => d.rarity === r.key).reduce((sum, d) => sum + d.count, 0) }))
    .filter((r) => r.count > 0);
}

type Step = "intro" | "choose" | "recap" | "rite";

/** Sceau du tirage d'une gravée, à côté de son numéro (un deuxième tirage redonne les mêmes numéros). */
function sealTag(seal: string | null | undefined) {
  return function SealTag() {
    return seal ? (
      <span lang="ja" className="font-seal">
        {seal}{" "}
      </span>
    ) : null;
  };
}

/**
 * Parcours de la renaissance : choix des héritières (exemplaires spéciaux d'abord, puis n'importe quelles cartes),
 * récapitulatif calculé par le serveur (ce qui part, les Zeni, les gravées et les héritières non gardées à confirmer
 * une à une), confirmation maintenue, puis le rite 転生. Le serveur relit tout sous verrou : ce que voit le joueur
 * n'est qu'une proposition.
 */
export function RebirthFlow({
  reason,
  prestige,
  slots,
  special,
  rarities,
  player,
  riteStyle,
  live,
}: {
  /** Pourquoi le joueur ne peut pas encore renaître (seuils ou blocages) ; null : il peut. */
  reason: "locked" | "blocked" | null;
  prestige: number;
  slots: number;
  special: SpecialCopyView[];
  rarities: RarityInfo[];
  player: { username: string; image: string | null; frame: FrameStyle | null; agreement: "MASC" | "FEM" };
  riteStyle: RiteStyle;
  /** Faux : aperçu de l'équipe, prestige coupé (prestige.staffLiveWhenDisabled) ; récapitulatif sans bouton. */
  live: boolean;
}) {
  const t = useTranslations("prestige.flow");
  const tErr = useTranslations("prestige.errors");
  const tInk = useTranslations("prestige.rite");
  const tCine = useTranslations("prestige.cinematic");
  const router = useRouter();
  const reduced = useReducedFx();
  const [step, setStep] = useState<Step>("intro");
  const [copyIds, setCopyIds] = useState<Set<string>>(() => new Set());
  const [cards, setCards] = useState<Set<string>>(() => new Set());
  const [preview, setPreview] = useState<RebirthPreviewView | null>(null);
  const [sacrificed, setSacrificed] = useState<Set<string>>(() => new Set());
  const [result, setResult] = useState<RebirthResultView | null>(null);
  const [error, setError] = useState<PrestigeActionError | "UNAVAILABLE" | null>(null);
  // Cartes décochées par le serveur (plus d'exemplaire ordinaire à garder)
  const [dropped, setDropped] = useState(0);
  const [pending, startTransition] = useTransition();

  const ready = reason === null;
  const kept = copyIds.size + cards.size;
  const full = kept >= slots;
  const keep = { keepCopyIds: [...copyIds], keepCardIds: [...cards] };

  // Coche ou décoche une héritière (exemplaire désigné ou carte), dans la limite des places
  const toggle = (set: typeof setCards, id: string) =>
    set((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (!full) next.add(id);
      return next;
    });
  const toggleCopy = (id: string) => toggle(setCopyIds, id);
  const toggleCard = (card: CollectionItem) => toggle(setCards, card.cardId);

  const openRecap = () =>
    startTransition(async () => {
      setError(null);
      setDropped(0);
      try {
        const res = await previewRebirthAction(keep);
        if (!res.ok) {
          // Cartes cochées sans exemplaire ordinaire : décochées, le joueur voit lesquelles manquent à sa sélection
          if (res.error === "KEEP_INVALID" && res.cardIds?.length) {
            const gone = new Set(res.cardIds);
            setCards((prev) => new Set([...prev].filter((id) => !gone.has(id))));
            setDropped(gone.size);
            return;
          }
          return setError(res.error);
        }
        setPreview(res.preview);
        setSacrificed(new Set());
        setStep("recap");
      } catch {
        // Coupure réseau ou erreur du serveur : rien n'a été écrit, on peut réessayer
        setError("UNAVAILABLE");
      }
    });

  const rebirth = () =>
    startTransition(async () => {
      if (!preview) return;
      setError(null);
      try {
        const res = await rebirthAction({
          ...keep,
          expectedPrestige: prestige,
          expectedZeni: preview.zeni,
          sacrificedEngraved: preview.engraved.map((e) => e.id),
          sacrificedHeirs: preview.heirs.map((h) => h.id),
        });
        if (!res.ok) {
          setError(res.error);
          if (res.error === "STALE") setStep("choose");
          return;
        }
        setResult(res.result);
        setStep("rite");
      } catch {
        // La renaissance a pu passer avant la coupure : la page est relue (prestige, collection), retour au début
        setError("UNAVAILABLE");
        setStep("intro");
        router.refresh();
      }
    });

  if (step === "rite" && result) {
    // Échap referme le rite : la page, déjà rafraîchie par l'action, montre le nouveau prestige
    const close = () => {
      setResult(null);
      setStep("intro");
    };
    return riteStyle === "CINEMATIC" ? (
      <RiteDialog label={tCine("label")} onClose={close}>
        <RebirthCinematic result={result} rarities={rarities} username={player.username} agreement={player.agreement} />
      </RiteDialog>
    ) : (
      <RiteDialog label={tInk("label")} onClose={close}>
        {/* Prestige d'avant lu dans le résultat : la page rafraîchie par l'action porte déjà le nouveau */}
        <RebirthRite result={result} previous={result.prestige - 1} rarities={rarities} player={player} />
      </RiteDialog>
    );
  }

  const errorLine = error && (
    <p role="alert" className="text-sm font-bold text-shu">
      {tErr.has(error) ? tErr(error) : tErr("UNAVAILABLE")}
    </p>
  );

  if (step === "intro") {
    return (
      <section className="sticky bottom-[calc(var(--mobile-nav-height)+0.5rem)] z-10 flex flex-col gap-2">
        {errorLine}
        <Button type="button" variant="primary" className="min-h-14 w-full" disabled={!ready} onClick={() => setStep("choose")}>
          {ready ? t("start", { slots }) : reason === "blocked" ? t("blocked") : t("locked")}
        </Button>
      </section>
    );
  }

  if (step === "choose") {
    return (
      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-title text-lg font-extrabold">{t("chooseTitle")}</h2>
          <output aria-live="polite" className={`font-bold tabular-nums ${full ? "text-kin" : "text-text-muted"}`}>
            {t("count", { count: kept, slots })}
          </output>
        </div>
        <p className="text-sm text-text-muted">{t("chooseIntro", { slots })}</p>
        {special.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="font-bold">{t("specialTitle")}</h3>
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {special.map((s) => {
                const on = copyIds.has(s.userCardId);
                return (
                  <li key={s.userCardId}>
                    <button
                      type="button"
                      aria-pressed={on}
                      disabled={!on && full}
                      onClick={() => toggleCopy(s.userCardId)}
                      className="flex w-full flex-col gap-1 rounded-card p-1 text-left text-xs aria-pressed:ring-2 aria-pressed:ring-kin disabled:opacity-40"
                    >
                      <Fuda card={{ ...s.card, copy: s.copy ?? { heritage: s.heritage } }} size="sm" still describeImage />
                      <span className="truncate font-bold">{s.card.name}</span>
                      <span className="text-kin">
                        {s.printing === null
                          ? t("heirCopy", { level: s.heritage })
                          : s.copy?.size != null
                            ? t.rich("engravedCopyOf", { serial: s.serial ?? 0, size: s.copy.size, seal: sealTag(s.copy.seal) })
                            : t("engravedCopy", { serial: s.serial ?? 0 })}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <h3 className="font-bold">{t("cardsTitle")}</h3>
          {/* Une carte cochée garde son plus ancien exemplaire ordinaire : sans ordinaire, on garde le spécial ci-dessus */}
          {special.length > 0 && <p className="text-xs text-text-muted">{t("noOrdinary")}</p>}
          <CardPickGrid
            selected={cards}
            onPick={toggleCard}
            pickLabel={(name) => t("pick", { name })}
            unavailable={(card) => (full && !cards.has(card.cardId)) || (card.ordinary === 0 && !cards.has(card.cardId))}
          />
        </div>
        {dropped > 0 && (
          <p role="alert" className="text-sm font-bold text-shu">
            {t("keepDropped", { count: dropped })}
          </p>
        )}
        {errorLine}
        <div className="sticky bottom-[calc(var(--mobile-nav-height)+0.5rem)] z-10 grid grid-cols-2 gap-2">
          <Button
            type="button"
            onClick={() => {
              setError(null);
              setDropped(0);
              setStep("intro");
            }}
            disabled={pending}
          >
            {t("cancel")}
          </Button>
          <Button type="button" variant="primary" onClick={openRecap} disabled={pending}>
            {pending ? t("loading") : t("next")}
          </Button>
        </div>
      </section>
    );
  }

  // Récapitulatif
  const p = preview!;
  const byRarity = departedByRarity(rarities, p.departed);
  const confirmed = p.engraved.every((e) => sacrificed.has(e.id)) && p.heirs.every((h) => sacrificed.has(h.id));
  // Case à cocher d'un exemplaire sacrifié (gravée ou héritière non gardée)
  const sacrifice = (copyId: string, label: ReactNode) => (
    <li key={copyId}>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-5 accent-shu-btn"
          checked={sacrificed.has(copyId)}
          onChange={(ev) =>
            setSacrificed((prev) => {
              const next = new Set(prev);
              if (ev.target.checked) next.add(copyId);
              else next.delete(copyId);
              return next;
            })
          }
        />
        <span>{label}</span>
      </label>
    </li>
  );
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-title text-lg font-extrabold">{t("recapTitle")}</h2>
      <dl className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-0.5 lacquer rounded-card p-3">
          <dt className="text-xs text-text-muted">{t("keptLabel")}</dt>
          <dd className="text-lg font-bold tabular-nums">{t("kept", { count: kept })}</dd>
        </div>
        <div className="flex flex-col gap-0.5 lacquer rounded-card p-3">
          <dt className="text-xs text-text-muted">{t("leavingLabel")}</dt>
          <dd className="text-lg font-bold tabular-nums">{t("leaving", { count: p.leaving })}</dd>
        </div>
        <div className="col-span-2 flex flex-col gap-0.5 lacquer rounded-card border-kin/45 p-3">
          <dt className="text-xs text-text-muted">{t("zeniLabel")}</dt>
          <dd className="text-lg font-bold tabular-nums text-kin">{t("zeni", { zeni: p.zeni })}</dd>
        </div>
        {p.booster && (
          <div className="col-span-2 flex flex-col gap-0.5 lacquer rounded-card border-kin/45 p-3">
            <dt className="text-xs text-text-muted">{t("boosterLabel")}</dt>
            <dd className="text-lg font-bold text-kin">{t("booster", { count: p.booster.count, name: p.booster.name })}</dd>
          </div>
        )}
      </dl>
      {byRarity.length > 0 && (
        <ul className="flex flex-wrap gap-2 text-xs">
          {byRarity.map((r) => (
            <li key={r.key} className="inline-flex items-center gap-1.5 rounded-pill border border-border px-2.5 py-1 tabular-nums">
              <span aria-hidden="true" lang="ja" className="font-seal" style={{ color: r.color }}>
                {r.seal}
              </span>
              {r.name} · {r.count}
            </li>
          ))}
        </ul>
      )}
      {p.engraved.length > 0 && (
        <div className="flex flex-col gap-2 lacquer rounded-card border-shu/50 p-4">
          <h3 className="font-bold text-shu">{t("engravedTitle")}</h3>
          <p className="text-sm text-text-muted">{t("engravedIntro")}</p>
          <ul className="flex flex-col gap-1">
            {p.engraved.map((e) =>
              sacrifice(
                e.id,
                e.size !== null
                  ? t.rich("engravedConfirmOf", { name: e.card.name, serial: e.serial, size: e.size, seal: sealTag(e.seal) })
                  : t("engravedConfirm", { name: e.card.name, serial: e.serial }),
              ),
            )}
          </ul>
        </div>
      )}
      {p.heirs.length > 0 && (
        <div className="flex flex-col gap-2 lacquer rounded-card border-kin/50 p-4">
          <h3 className="font-bold text-kin">{t("heirsTitle")}</h3>
          <p className="text-sm text-text-muted">{t("heirsIntro")}</p>
          <ul className="flex flex-col gap-1">{p.heirs.map((h) => sacrifice(h.id, t("heirConfirm", { name: h.card.name, level: h.heritage })))}</ul>
        </div>
      )}
      <p className="text-sm text-text-muted">{t("final")}</p>
      {errorLine}
      <div className="sticky bottom-[calc(var(--mobile-nav-height)+0.5rem)] z-10 flex flex-col gap-2">
        {live ? (
          <HoldButton
            label={t("hold")}
            kanji="転生"
            pendingLabel={t("holding")}
            confirmLabel={t("holdConfirm")}
            hint={t("holdHint")}
            disabled={!confirmed}
            pending={pending}
            reduced={reduced}
            onHold={rebirth}
          />
        ) : (
          <p className="lacquer rounded-card border-ai/50 p-3 text-sm text-ai">{t("previewOnly")}</p>
        )}
        <Button type="button" onClick={() => setStep("choose")} disabled={pending}>
          {t("back")}
        </Button>
      </div>
    </section>
  );
}
