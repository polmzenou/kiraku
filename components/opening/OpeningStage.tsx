"use client";

import { AnimatePresence, domAnimation, LazyMotion, m, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { OPEN_COUNTS, type BoosterSlug, type OpenCount, type SachetTheme } from "@/lib/boosters/catalog";
import type { OpenedBoosterView } from "@/lib/boosters/view";
import { openBoosterAction, type OpenBoosterError } from "@/server/actions/boosters";
import type { BoosterState } from "@/server/boosters/state";
import { NextFreeIn } from "../boosters/NextFreeIn";
import { Fuda } from "../fuda/Fuda";
import { FudaTilt } from "../fuda/FudaTilt";
import { Button, buttonClasses } from "../ui/Button";
import { CopyLinkButton } from "./CopyLinkButton";
import { CountPicker } from "./CountPicker";
import { NewStamp, RevealCard } from "./RevealCard";
import { TearableSachet } from "./TearableSachet";

type Stage = { kind: "ready" } | { kind: "reveal"; index: number } | { kind: "recap" };

type Props = {
  slug: BoosterSlug;
  theme: SachetTheme;
  name: string;
  tagline: string;
  contents: string;
  initialState: BoosterState;
};

/**
 * Ouverture d'un booster : sachet à déchirer → fuda révélées une à une → récap.
 * Le serveur a déjà enregistré le tirage quand l'animation commence : fermer l'onglet ne fait rien perdre.
 */
export function OpeningStage({ slug, theme, name, tagline, contents, initialState }: Props) {
  const t = useTranslations("opening");
  const reduced = useReducedMotion() ?? false;
  const [stage, setStage] = useState<Stage>({ kind: "ready" });
  const [count, setCount] = useState<OpenCount>(1);
  const [boosters, setBoosters] = useState<OpenedBoosterView[] | null>(null);
  const [error, setError] = useState<OpenBoosterError | null>(null);
  const [pending, setPending] = useState(false);
  const [latest, setLatest] = useState<BoosterState | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Les cartes sortent quand la déchirure est finie ET que le serveur a répondu
  const torn = useRef(false);
  const result = useRef<OpenedBoosterView[] | null>(null);

  // État le plus récent entre la page (rafraîchie par le serveur) et la réponse de l'ouverture
  const state = latest && latest.serverNow > initialState.serverNow ? latest : initialState;
  const allowed = OPEN_COUNTS.filter((n) => n <= state.stock);
  const effectiveCount: OpenCount = count <= state.stock ? count : (allowed.at(-1) ?? 1);

  const reveal = () => {
    if (!torn.current || !result.current) return;
    setBoosters(result.current);
    setStage({ kind: "reveal", index: 0 });
  };

  const trigger = async () => {
    setError(null);
    setPending(true);
    result.current = null;
    const res = await openBoosterAction({ booster: slug, count: effectiveCount });
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      torn.current = false;
      setAttempt((a) => a + 1); // nouveau sachet intact
      return;
    }
    setLatest(res.state);
    result.current = res.boosters;
    reveal();
  };

  const onTorn = () => {
    torn.current = true;
    reveal();
  };

  const again = () => {
    torn.current = false;
    result.current = null;
    setBoosters(null);
    setError(null);
    setAttempt((a) => a + 1);
    setStage({ kind: "ready" });
  };

  return (
    <LazyMotion features={domAnimation} strict>
      <div className="flex flex-col items-center gap-6">
        <p aria-live="polite" className="sr-only">
          {pending ? t("opening") : ""}
        </p>

        {error && (
          <p role="alert" className="rounded-button border border-shu px-3 py-2 text-sm text-shu">
            {t(`errors.${error}`)}
          </p>
        )}

        <AnimatePresence mode="wait" initial={false}>
          {stage.kind === "ready" && (
            <m.div
              key={`ready-${attempt}`}
              className="flex w-full flex-col items-center gap-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: 40 }}
              transition={{ duration: 0.25 }}
            >
              <TearableSachet
                theme={theme}
                name={name}
                tagline={tagline}
                contents={contents}
                disabled={state.stock < 1}
                reduced={reduced}
                count={effectiveCount}
                onTrigger={trigger}
                onTorn={onTorn}
              />
              <StockLine state={state} />
              {state.stock > 1 && <CountPicker value={effectiveCount} stock={state.stock} onChange={setCount} />}
            </m.div>
          )}

          {stage.kind === "reveal" && boosters && (
            <m.div
              key={`reveal-${stage.index}`}
              className="flex w-full flex-col items-center gap-5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {boosters.length > 1 && (
                <p className="text-sm text-text-muted">
                  {t("revealLabel", { current: stage.index + 1, total: boosters.length })}
                </p>
              )}
              <BoosterBadges booster={boosters[stage.index]} />
              <ul className="grid w-full max-w-2xl grid-cols-2 gap-4 sm:grid-cols-4">
                {boosters[stage.index].cards.map((card, i) => (
                  <li key={card.userCardId}>
                    <RevealCard card={card} index={i} reduced={reduced} size="md" />
                  </li>
                ))}
              </ul>
              <div className="flex w-full max-w-sm flex-col gap-2">
                {stage.index + 1 < boosters.length ? (
                  <Button variant="shu" onClick={() => setStage({ kind: "reveal", index: stage.index + 1 })}>
                    {t("next", { current: stage.index + 2, total: boosters.length })}
                  </Button>
                ) : (
                  <Button variant="shu" onClick={() => setStage({ kind: "recap" })}>
                    {t("toRecap")}
                  </Button>
                )}
                {stage.index + 1 < boosters.length && (
                  <Button onClick={() => setStage({ kind: "recap" })}>{t("skip")}</Button>
                )}
              </div>
            </m.div>
          )}

          {stage.kind === "recap" && boosters && (
            <m.div
              key="recap"
              className="flex w-full flex-col gap-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Recap
                boosters={boosters}
                state={state}
                count={effectiveCount}
                onCount={setCount}
                onAgain={again}
              />
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </LazyMotion>
  );
}

function StockLine({ state }: { state: BoosterState }) {
  const t = useTranslations("opening");
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <p className="text-sm font-bold">{t("stockLeft", { count: state.stock })}</p>
      <NextFreeIn nextAt={state.nextAt} serverNow={state.serverNow} />
    </div>
  );
}

function BoosterBadges({ booster }: { booster: OpenedBoosterView }) {
  const t = useTranslations("opening");
  const badges = [
    booster.divine && { label: t("divine"), className: "border-rarity-mythic text-rarity-mythic", glyph: "神" },
    booster.golden && { label: t("golden"), className: "border-kin text-kin", glyph: "金" },
    booster.pityTriggered && { label: t("pityTriggered"), className: "border-shu text-shu", glyph: "神" },
  ].filter(Boolean) as { label: string; className: string; glyph: string }[];
  if (badges.length === 0) return null;
  return (
    <ul className="flex flex-wrap justify-center gap-2">
      {badges.map((b) => (
        <li key={b.label} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${b.className}`}>
          <span aria-hidden="true" lang="ja" className="font-seal">
            {b.glyph}
          </span>
          {b.label}
        </li>
      ))}
    </ul>
  );
}

type RecapProps = {
  boosters: OpenedBoosterView[];
  state: BoosterState;
  count: OpenCount;
  onCount: (n: OpenCount) => void;
  onAgain: () => void;
};

/** Récap d'ouverture : les cartes de chaque sachet, compteurs, et de quoi enchaîner. */
function Recap({ boosters, state, count, onCount, onAgain }: RecapProps) {
  const t = useTranslations("opening");
  const many = boosters.length > 1;
  const newCount = boosters.reduce((n, b) => n + b.cards.filter((c) => c.isNew).length, 0);

  return (
    <>
      <div className="flex flex-col items-center gap-1 text-center">
        <h2 className="font-title text-2xl font-extrabold">{t("recapTitle")}</h2>
        <p className="text-sm text-text-muted">{t("newCount", { count: newCount })}</p>
      </div>

      <ol className="flex flex-col gap-6">
        {boosters.map((b, i) => (
          <li key={b.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {many && <h3 className="text-sm font-bold">{t("boosterN", { n: i + 1 })}</h3>}
                <BoosterBadges booster={b} />
              </div>
              <CopyLinkButton openingId={b.id} />
            </div>
            <ul className={`grid gap-3 ${many ? "grid-cols-4" : "grid-cols-2 sm:grid-cols-4"}`}>
              {b.cards.map((card) => (
                <li key={card.userCardId} className="relative">
                  <FudaTilt>
                    <Fuda card={card} series={card.series} size={many ? "sm" : "md"} />
                  </FudaTilt>
                  {card.isNew && <NewStamp animated={false} />}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-4 rounded-lg border border-border bg-surface p-4">
        <ul className="flex flex-col items-center gap-1 text-center text-sm">
          <li>{t("pityLine", { count: state.pityLeft })}</li>
          {state.goldenIn !== null && <li className="text-kin">{t("goldenLine", { count: state.goldenIn })}</li>}
        </ul>
        {state.stock > 1 && <CountPicker value={count} stock={state.stock} onChange={onCount} />}
        <Button variant="shu" onClick={onAgain} disabled={state.stock < 1} className="w-full justify-between">
          <span className="font-title text-lg font-bold">{count > 1 ? t("openMore", { n: count }) : t("openAnother")}</span>
          <span className="text-xs">{t("free")}</span>
        </Button>
        <StockLine state={state} />
        <Link href="/boosters" className={buttonClasses("neutral", "w-full")}>
          {t("changeBooster")}
        </Link>
      </div>
    </>
  );
}
