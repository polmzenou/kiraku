"use client";

import { AnimatePresence, domMax, LazyMotion, m } from "motion/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { OPEN_COUNTS, type OpenCount } from "@/lib/boosters/catalog";
import { priceFor, type BoosterShape, type BoosterTheme, type Price } from "@/lib/boosters/types";
import type { OpenedBoosterView } from "@/lib/boosters/view";
import type { Rarity } from "@/lib/catalog/rarity";
import { useRarities } from "@/lib/catalog/use-rarities";
import { openBoosterAction, type OpenBoosterError } from "@/server/actions/boosters";
import type { BoosterState } from "@/server/boosters/state";
import { NextFreeIn } from "../boosters/NextFreeIn";
import { Fuda } from "../fuda/Fuda";
import { ZeniCoin } from "../layout/ZeniCoin";
import { Button } from "../ui/Button";
import { BoosterScene, type SceneHandle } from "./BoosterScene";
import { CardDeck, revealOrder } from "./CardDeck";
import { CountPicker } from "./CountPicker";
import { GoldenDust } from "./GoldenDust";
import { GuestSignupPrompt } from "./GuestSignupPrompt";
import { Recap } from "./Recap";
import { RecapActionBar } from "./RecapActionBar";
import { RevealOverlay, momentTint, TINT_DELAY, useMomentFor, type Moment } from "./RevealMoment";
import { RitualBackdrop } from "./RitualBackdrop";
import { SettingsMenu } from "./SettingsMenu";
import { SoundToggle } from "./SoundToggle";
import { useRitualFx } from "./useRitualFx";
import { useReducedFx } from "@/components/motion/MotionPreference";

type Stage = "ready" | "opening" | "reveal" | "recap";

export type OpeningType = {
  slug: string;
  /** Famille du booster : « Changer de booster » y ramène, booster sélectionné. */
  family: string;
  shape: BoosterShape;
  theme: BoosterTheme;
  emblem: string;
  name: string;
  tagline: string;
  /** Cartes par booster (étiquette « 四枚入 »). */
  cards: number;
  contents: string;
  usesFreeStock: boolean;
  priceZeni: number | null;
  countsForPity: boolean;
  bonusEligible: boolean;
  /** Bannière : seuil de pitié vedette et compteur du joueur. */
  featured: { threshold: number; count: number } | null;
};

/**
 * `credits` : boosters crédités de ce type (cadeaux d'amis, boutique, récompenses) à ouvrir en
 * premier, sans doré ni divin.
 */
type Props = { type: OpeningType; initialState: BoosterState; isGuest: boolean; credits?: number };

/** Meilleure carte du tirage, dans l'ordre du registre (AR et Gold au-dessus de Mythique). */
const bestRarity = (boosters: OpenedBoosterView[], RARITIES: readonly Rarity[]): Rarity =>
  boosters
    .flatMap((b) => b.cards)
    .reduce<Rarity>((best, c) => (RARITIES.indexOf(c.rarity) > RARITIES.indexOf(best) ? c.rarity : best), "COMMON");

/** Plus grande quantité ouvrable d'un coup (stock gratuit ou Zeni disponibles). */
function maxOpenable(type: OpeningType, state: BoosterState): number {
  const ok = (n: number) => {
    const p = priceFor(type, state.stock, n);
    return p.kind === "free" || (p.kind === "zeni" && p.amount <= state.coins);
  };
  return OPEN_COUNTS.filter(ok).at(-1) ?? 0;
}

/**
 * L'ouverture, « le rituel » : la scène s'assombrit, le booster flotte et s'ouvre d'un geste, la
 * lumière qui s'échappe annonce la meilleure carte, toutes les fuda se tirent de la pile une à une,
 * puis le récap se déroule. Le tirage est déjà enregistré par le serveur
 * quand l'animation commence : fermer l'onglet ne fait rien perdre.
 */
export function OpeningStage({ type, initialState, isGuest, credits = 0 }: Props) {
  const rarities = useRarities();
  const t = useTranslations("opening");
  const reduced = useReducedFx();
  const fx = useRitualFx();
  const [stage, setStage] = useState<Stage>("ready");
  const [count, setCount] = useState<OpenCount>(1);
  const [boosters, setBoosters] = useState<OpenedBoosterView[] | null>(null);
  const [error, setError] = useState<OpenBoosterError | null>(null);
  const [latest, setLatest] = useState<BoosterState | null>(null);
  const [featuredCount, setFeaturedCount] = useState(type.featured?.count ?? 0);
  const [zeniSpent, setZeniSpent] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [confirmed, setConfirmed] = useState<number | null>(null);
  const [depth, setDepth] = useState(0);
  const [shake, setShake] = useState(0);
  const [creditLeft, setCreditLeft] = useState(credits);
  const [openedCredit, setOpenedCredit] = useState(false);
  const [momentCard, setMomentCard] = useState<Pick<Moment, "id" | "rarity"> | null>(null);
  const momentFor = useMomentFor();
  const moment = momentCard ? momentFor(momentCard.id, momentCard.rarity) : null;
  const opened = useRef(false);
  const result = useRef<OpenedBoosterView[] | null>(null);
  const scene = useRef<SceneHandle | null>(null);
  const stageTop = useRef<HTMLDivElement | null>(null);
  const wantFocus = useRef(false);
  // Après « Ouvrir un autre », le bouton du nouveau booster reçoit le focus dès qu'il apparaît
  const readyActions = useCallback((el: HTMLDivElement | null) => {
    if (!el || !wantFocus.current) return;
    wantFocus.current = false;
    el.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
  }, []);
  const mounted = useRef(false);

  // État le plus récent entre la page (rafraîchie par le serveur) et la réponse de l'ouverture
  const state = latest && latest.serverNow > initialState.serverNow ? latest : initialState;
  const creditMode = creditLeft > 0;
  const maxCount = creditMode ? (OPEN_COUNTS.filter((n) => n <= creditLeft).at(-1) ?? 1) : maxOpenable(type, state);
  const effectiveCount: OpenCount = count <= maxCount ? count : ((OPEN_COUNTS.filter((n) => n <= maxCount).at(-1) ?? 1) as OpenCount);
  const price: Price = creditMode ? { kind: "free" } : priceFor(type, state.stock, effectiveCount);
  const unaffordable = price.kind === "zeni" && price.amount > state.coins;
  const needsConfirm = price.kind === "zeni" && !unaffordable && confirmed !== price.amount;
  const armed = stage === "ready" && !unaffordable && price.kind !== "unavailable" && !needsConfirm;

  const goReveal = () => {
    if (!opened.current || !result.current) return;
    // Laisser la lumière s'épanouir un instant avant de sortir les cartes
    setTimeout(() => {
      setStage("reveal");
      setDepth(0.25);
      fx.play("whoosh");
    }, reduced ? 0 : 650);
  };

  const trigger = async () => {
    setError(null);
    setStage("opening");
    setDepth(0.15);
    result.current = null;
    const res = await openBoosterAction(
      creditMode
        ? { booster: type.slug, count: effectiveCount, credit: true }
        : { booster: type.slug, count: effectiveCount, pay: price.kind === "zeni" },
    );
    if (!res.ok) {
      setError(res.error);
      opened.current = false;
      setStage("ready");
      setDepth(0);
      setConfirmed(null);
      setAttempt((a) => a + 1); // nouveau booster intact
      return;
    }
    setLatest(res.state);
    setFeaturedCount(res.featuredCount);
    setZeniSpent(res.zeniSpent);
    setOpenedCredit(creditMode);
    setCreditLeft(creditMode ? res.credits : 0);
    setBoosters(res.boosters);
    result.current = res.boosters;
    goReveal();
  };

  const onOpened = () => {
    if (opened.current) return;
    opened.current = true;
    goReveal();
  };

  const onMythic = useCallback(() => {
    setDepth(1);
    setShake((s) => s + 1);
    setTimeout(() => setDepth(0.25), 2200);
  }, []);

  const toRecap = useCallback(() => {
    setStage("recap");
    setDepth(0);
  }, []);

  const again = () => {
    wantFocus.current = true;
    opened.current = false;
    result.current = null;
    setBoosters(null);
    setError(null);
    setConfirmed(null);
    setAttempt((a) => a + 1);
    setStage("ready");
  };

  // Chaque changement d'étape ramène la scène sous l'en-tête : « Ouvrir un autre » depuis le bas du
  // récap remonte au nouveau booster, la pile de cartes et le récap s'ouvrent par le haut.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (stage === "opening") return;
    stageTop.current?.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
  }, [stage, attempt, reduced]);

  const first = boosters?.[0];
  const variant = first?.divine ? "divine" : first?.golden ? "golden" : undefined;
  const ritual = stage !== "recap";

  return (
    <LazyMotion features={domMax} strict>
      <AnimatePresence>
        {ritual && (
          <RitualBackdrop
            key="backdrop"
            depth={depth}
            reduced={reduced}
            tint={moment ? { id: moment.id, style: momentTint(moment.color), delay: TINT_DELAY } : null}
          />
        )}
      </AnimatePresence>

      {/* Une Mythique fait trembler la scène (le compteur change les images clés et relance l'animation).
          Au repos, une cible fixe plutôt que `undefined` : sinon Motion ne monte son animation qu'au premier
          tremblement, le prend pour un premier rendu et `initial={false}` l'annule. */}
      <m.div
        ref={stageTop}
        className="relative z-50 flex scroll-mt-20 flex-col items-center gap-6 md:scroll-mt-24"
        initial={false}
        animate={reduced || shake === 0 ? { x: 0 } : { x: shake % 2 ? [0, -7, 7, -5, 5, -2, 0] : [0, 7, -7, 5, -5, 2, 0] }}
        transition={{ duration: 0.45 }}
      >
        <div className="flex w-full items-center justify-end gap-2">
          <SettingsMenu />
          <SoundToggle enabled={fx.enabled} onChange={fx.setEnabled} />
        </div>

        <p aria-live="polite" className="sr-only">
          {stage === "opening" ? t("opening") : ""}
        </p>

        {error && (
          <p role="alert" className="rounded-control border border-shu bg-bg px-3 py-2 text-sm text-shu">
            {t(`errors.${error}`)}
          </p>
        )}

        <AnimatePresence mode="wait" initial={false}>
          {(stage === "ready" || stage === "opening") && (
            <m.div
              key={`scene-${attempt}`}
              className="flex w-full flex-col items-center gap-6"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: 80, scale: 0.9 }}
              transition={{ duration: 0.35 }}
            >
              <BoosterScene
                shape={type.shape}
                theme={type.theme}
                emblem={type.emblem}
                name={type.name}
                openLabel={t("openPack", { name: type.name })}
                tagline={type.tagline}
                contents={type.contents}
                count={effectiveCount}
                armed={armed}
                reduced={reduced}
                leak={boosters ? bestRarity(boosters, rarities) : null}
                divine={variant === "divine"}
                onTrigger={() => void trigger()}
                onOpened={onOpened}
                onTearSound={() => fx.play("tear", 15)}
                openRef={(h) => {
                  scene.current = h;
                }}
              />

              {stage === "ready" && (
                <div ref={readyActions} className="flex w-full max-w-sm flex-col items-center gap-4">
                  <p className="text-center text-sm text-text-muted">
                    {reduced ? t("hintReduced") : type.shape === "SACHET" ? t("hint") : t("hintLift")}
                  </p>

                  {maxCount > 1 && (
                    <CountPicker
                      value={effectiveCount}
                      max={maxCount}
                      onChange={(n) => {
                        setCount(n);
                        setConfirmed(null);
                      }}
                    />
                  )}

                  {needsConfirm && price.kind === "zeni" ? (
                    <Button variant="primary" size="lg" onClick={() => setConfirmed(price.amount)} className="w-full gap-2">
                      <ZeniCoin size={16} />
                      {t("payConfirm", { amount: price.amount })}
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="lg"
                      onClick={() => scene.current?.open()}
                      disabled={!armed}
                      className="w-full"
                      // Bouton scindé : l'action, puis le stock gratuit restant
                      meta={price.kind === "free" && !creditMode ? t("stockLeft", { count: state.stock }) : undefined}
                    >
                      {type.shape === "SACHET" ? t("tear") : t("lift")}
                    </Button>
                  )}

                  {creditMode ? (
                    <p className="flex items-center gap-1.5 text-sm font-bold text-kin">
                      <span aria-hidden="true" lang="ja" className="font-seal">
                        贈
                      </span>
                      {t("creditLeft", { count: creditLeft })}
                    </p>
                  ) : (
                    price.kind !== "free" && <PriceLine price={price} unaffordable={unaffordable} coins={state.coins} stock={state.stock} />
                  )}
                  {type.usesFreeStock && !creditMode && <NextFreeIn nextAt={state.nextAt} serverNow={state.serverNow} />}
                </div>
              )}
              {stage === "opening" && (
                <p className="animate-pulse text-sm text-text-muted" aria-hidden="true">
                  {t("opening")}
                </p>
              )}
            </m.div>
          )}

          {stage === "reveal" && boosters && (
            <m.div
              key="reveal"
              className="flex w-full flex-col items-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <CardDeck
                cards={boosters.flatMap((booster) => booster.cards)}
                reduced={reduced}
                play={fx.play}
                onMythic={onMythic}
                onMoment={setMomentCard}
                onDone={toRecap}
              />
            </m.div>
          )}

          {stage === "recap" && boosters && (
            <m.div key="recap" className="w-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Recap
                boosters={boosters}
                state={state}
                reduced={reduced}
                play={fx.play}
                counters={{
                  pity: type.countsForPity,
                  golden: type.bonusEligible && !openedCredit,
                  featured: type.featured
                    ? { left: Math.max(1, type.featured.threshold - featuredCount), threshold: type.featured.threshold }
                    : null,
                }}
                zeniSpent={zeniSpent}
                count={effectiveCount}
                maxCount={maxCount}
                onCount={(n) => {
                  setCount(n);
                  setConfirmed(null);
                }}
              />
              {isGuest && <GuestSignupPrompt />}
            </m.div>
          )}
        </AnimatePresence>

        {/* Charger les premières cartes en grand pendant l'ouverture, avant leur révélation. */}
        {boosters && stage === "opening" && (
          <div aria-hidden="true" className="pointer-events-none invisible absolute top-0 left-0 w-40 overflow-hidden">
            {revealOrder(boosters.flatMap((booster) => booster.cards)).slice(0, 2).map((card) =>
              <Fuda key={card.userCardId} card={card} size="lg" preload tilt={false} />,
            )}
          </div>
        )}
      </m.div>

      {/* Hors du calque qui tremble : un `transform` ancêtre casserait le `fixed` mobile */}
      {stage === "reveal" && moment && !reduced && <RevealOverlay key={moment.id} moment={moment} />}
      {variant === "golden" && ritual && !reduced && <GoldenDust key={`dust-${attempt}`} />}
      {stage === "recap" && boosters && (
        <RecapActionBar
          count={effectiveCount}
          nextPrice={unaffordable ? { kind: "unavailable" } : price}
          onAgain={again}
          changeHref={`/?b=${type.slug}&f=${type.family}`}
          reduced={reduced}
        />
      )}
    </LazyMotion>
  );
}

function PriceLine({ price, unaffordable, coins, stock }: { price: Price; unaffordable: boolean; coins: number; stock: number }) {
  const t = useTranslations("opening");
  if (price.kind === "free") return <p className="text-sm font-bold">{t("stockLeft", { count: stock })}</p>;
  if (price.kind === "zeni") {
    return (
      <p className={`flex items-center gap-1.5 text-sm font-bold ${unaffordable ? "text-shu" : "text-kin"}`}>
        <ZeniCoin size={14} />
        {unaffordable ? t("notEnoughZeni", { amount: price.amount, coins }) : t("costLine", { amount: price.amount, coins })}
      </p>
    );
  }
  return <p className="text-sm text-text-muted">{t("noStock")}</p>;
}
