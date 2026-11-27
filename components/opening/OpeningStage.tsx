"use client";

import { AnimatePresence, domMax, LazyMotion, m } from "motion/react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { preload } from "react-dom";
import { Link, useRouter } from "@/i18n/navigation";
import { choiceCount, effectiveChoice, OPEN_COUNTS, openAllCount, type OpenChoice } from "@/lib/boosters/catalog";
import type { ApocalypseOutcome, SealedKind } from "@/lib/boosters/draw";
import { priceFor, type BoosterShape, type BoosterTheme, type Price } from "@/lib/boosters/types";
import type { DroppedSealedView, OpenedBoosterView, SealedDisplay } from "@/lib/boosters/view";
import type { Rarity } from "@/lib/catalog/rarity";
import { useRarities } from "@/lib/catalog/use-rarities";
import { hasPrism, PRISM } from "@/lib/opening/prism";
import { openBoosterAction, openSealedAction, type OpenBoosterError } from "@/server/actions/boosters";
import type { BoosterState } from "@/server/boosters/state";
import { NextFreeIn } from "../boosters/NextFreeIn";
import { CARD_BACKS } from "../fuda/CardBack";
import { Fuda } from "../fuda/Fuda";
import { ZeniCoin } from "../layout/ZeniCoin";
import { Button, buttonClasses } from "../ui/Button";
import { BoosterScene, type SceneHandle } from "./BoosterScene";
import { ApocalypseOmen, SealedTransform, sealedGlyph } from "./SealedFx";
import { CardDeck, revealOrder, type DeckFrom } from "./CardDeck";
import { CountPicker } from "./CountPicker";
import { GoldenDust } from "./GoldenDust";
import { GuestSignupPrompt, type GuestInvite } from "./GuestSignupPrompt";
import { PrismWash } from "./PrismLight";
import { Recap } from "./Recap";
import { RecapActionBar } from "./RecapActionBar";
import { RevealOverlay, momentTint, TINT_DELAY, useMomentFor, type Moment } from "./RevealMoment";
import { RevealLayerContext } from "./RevealScene";
import { RitualBackdrop } from "./RitualBackdrop";
import { SettingsMenu } from "./SettingsMenu";
import { SoundToggle } from "./SoundToggle";
import { useRitualFx } from "./useRitualFx";
import { useFxLevel, useMotionPreference } from "@/components/motion/MotionPreference";
import { hasMeasuredTier, probeFrames, watchFrames } from "@/components/motion/fx-tier";
import { FrescoRecap } from "./FrescoRecap";

// Révélation des fragments de fresque : chargée seulement quand un fragment tombe
const FrescoFragmentReveal = dynamic(() => import("./FrescoFragmentReveal").then((mod) => mod.FrescoFragmentReveal), { ssr: false });

/** transform : le booster s'est changé en sachet scellé ; omen : le sceau d'un Apocalyptique se fend. */
type Stage = "ready" | "opening" | "transform" | "omen" | "reveal" | "recap";

/** Sachet scellé à ouvrir sur cette scène. */
type SealedTarget = { id: string; kind: SealedKind };

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
  /** Booster garanti (donné par l'équipe) : sceau « 確定 » sur le sachet. */
  guaranteed?: boolean;
  /** Bannière : seuil de pitié vedette et compteur du joueur. */
  featured: { threshold: number; count: number } | null;
};

/**
 * `credits` : boosters crédités de ce type (cadeaux d'amis, boutique, récompenses) à ouvrir en
 * premier, sans doré ni divin.
 */
type Props = {
  type: OpeningType;
  initialState: BoosterState;
  isGuest: boolean;
  /** Invité arrivé par le lien d'un parrain : son cadeau, montré après le premier booster. */
  guestInvite?: GuestInvite | null;
  credits?: number;
  /** Nombre présélectionné (×5 ou « Tous » choisi dans la vitrine) ; ramené à ce qui est ouvrable. */
  initialCount?: OpenChoice;
  /** Ouverture à appeler : l'action serveur, ou un tirage factice pour le banc de test de l'admin. */
  open?: typeof openBoosterAction;
  /** Dessin des sachets scellés qui peuvent tomber de ce booster. */
  sealedTypes?: Partial<Record<SealedKind, SealedDisplay>>;
  /** Sachet scellé à ouvrir d'abord (lien ?sachet=… de l'accueil ou d'une notification). */
  sealed?: SealedTarget | null;
  /** Karma de l'Apocalypse du joueur et seuil d'épargne forcée (0 = pas de karma). */
  karma?: { current: number; threshold: number };
  /** Ouverture d'un sachet scellé : l'action serveur, ou un tirage factice (banc de test). */
  openSealed?: typeof openSealedAction;
  /** Liens « Offrir » vers /amis (absents sur le banc de test). */
  giftLinks?: boolean;
};

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
export function OpeningStage({
  type,
  initialState,
  isGuest,
  guestInvite = null,
  credits = 0,
  initialCount = 1,
  open = openBoosterAction,
  sealedTypes = {},
  sealed = null,
  karma: initialKarma = { current: 0, threshold: 0 },
  openSealed = openSealedAction,
  giftLinks = true,
}: Props) {
  const rarities = useRarities();
  const t = useTranslations("opening");
  const tSealed = useTranslations("sealed");
  const router = useRouter();
  const level = useFxLevel();
  const reduced = level === "reduced";
  const lite = level === "lite";
  const { pref } = useMotionPreference();
  const fx = useRitualFx();
  // Les deux dos servent à chaque ouverture : chargés avant que la pile n'apparaisse
  preload(CARD_BACKS.standard, { as: "image", fetchPriority: "low" });
  preload(CARD_BACKS.premium, { as: "image", fetchPriority: "low" });
  const [stage, setStage] = useState<Stage>("ready");
  const [count, setCount] = useState<OpenChoice>(initialCount);
  const [boosters, setBoosters] = useState<OpenedBoosterView[] | null>(null);
  const [error, setError] = useState<OpenBoosterError | null>(null);
  const [latest, setLatest] = useState<BoosterState | null>(null);
  const [featuredCount, setFeaturedCount] = useState(type.featured?.count ?? 0);
  const [zeniSpent, setZeniSpent] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [confirmed, setConfirmed] = useState<number | null>(null);
  const [depth, setDepth] = useState(0);
  const [shake, setShake] = useState(0);
  // Prisme de la XR : le sachet tremble et l'arc-en-ciel jaillit (voile plein écran, sons)
  const [prismOn, setPrismOn] = useState(false);
  const [creditLeft, setCreditLeft] = useState(credits);
  const [openedCredit, setOpenedCredit] = useState(false);
  const [momentCard, setMomentCard] = useState<Pick<Moment, "id" | "rarity"> | null>(null);
  const [revealLayer, setRevealLayer] = useState<HTMLDivElement | null>(null);
  const [deckFrom, setDeckFrom] = useState<DeckFrom | null>(null);
  // Sachets scellés : celui qu'on ouvre sur cette scène, ceux tombés à l'instant, karma et issue
  const [sealedOpen, setSealedOpen] = useState<SealedTarget | null>(sealed && sealedTypes[sealed.kind] ? sealed : null);
  const [openedSealed, setOpenedSealed] = useState<SealedKind | null>(null);
  const [drops, setDrops] = useState<DroppedSealedView[]>([]);
  const [karma, setKarma] = useState(initialKarma.current);
  const [outcome, setOutcome] = useState<ApocalypseOutcome | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Fragments de fresque : révélés une fois après les cartes de chaque ouverture, puis « Revoir » depuis le récap
  const [frescoSeenFor, setFrescoSeenFor] = useState<OpenedBoosterView[] | null>(null);
  const [frescoReplay, setFrescoReplay] = useState<number | null>(null);
  const fragments = useMemo(() => boosters?.flatMap((b) => (b.fresco ? [b.fresco] : [])) ?? [], [boosters]);
  const dropsRef = useRef<DroppedSealedView[]>([]);
  const omenRef = useRef<ApocalypseOutcome | null>(null);
  const transformSeen = useRef(false);
  const omenSeen = useRef(false);
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
  // Le booster ou la pile démontés, le focus est tombé sur <body> : il rejoint le titre de l'étape qui arrive
  // (transformation, récap), sans défilement, au lieu de repartir du haut de la page au clavier
  const landing = useCallback((el: HTMLDivElement | null) => {
    if (!el || (document.activeElement && document.activeElement !== document.body)) return;
    el.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }, []);
  const mounted = useRef(false);

  // État le plus récent entre la page (rafraîchie par le serveur) et la réponse de l'ouverture
  const state = latest && latest.serverNow > initialState.serverNow ? latest : initialState;
  // Sachet scellé sur la scène : un seul, déjà payé (tombé d'un booster), dessiné à son thème
  const sealedDisplay = sealedOpen ? sealedTypes[sealedOpen.kind] : undefined;
  const shown = sealedDisplay ?? type;
  const creditMode = !sealedOpen && creditLeft > 0;
  const maxCount = sealedOpen ? 1 : creditMode ? (OPEN_COUNTS.filter((n) => n <= creditLeft).at(-1) ?? 1) : maxOpenable(type, state);
  // « Tous » : le reste des crédits, ou tout le stock gratuit (jamais payant)
  const allCount = sealedOpen ? 0 : openAllCount(creditMode ? creditLeft : type.usesFreeStock ? state.stock : 0);
  const choice: OpenChoice = sealedOpen ? 1 : effectiveChoice(count, maxCount, allCount);
  const effectiveCount = choiceCount(choice, allCount);
  const showPicker = maxCount > 1 || allCount > 0;
  const price: Price = sealedOpen || creditMode ? { kind: "free" } : priceFor(type, state.stock, effectiveCount);
  const unaffordable = price.kind === "zeni" && price.amount > state.coins;
  const needsConfirm = price.kind === "zeni" && !unaffordable && confirmed !== price.amount;
  const armed = stage === "ready" && !unaffordable && price.kind !== "unavailable" && !needsConfirm;
  // Le booster de la page ne s'ouvre pas (sachet scellé seul) : après le récap, retour à l'accueil
  const pageOpenable = creditLeft > 0 || priceFor(type, state.stock, 1).kind !== "unavailable";

  const goReveal = () => {
    if (!opened.current || !result.current) return;
    // Un booster s'est transformé : le sachet tombé passe avant les cartes
    if (dropsRef.current.length > 0 && !transformSeen.current) {
      setStage("transform");
      setDepth(0.35);
      fx.play("taiko", [30, 40, 60]);
      return;
    }
    // Apocalyptique : le sceau se fend avant la pile, l'issue n'est montrée qu'à ce moment
    if (omenRef.current && !omenSeen.current) {
      setStage("omen");
      setDepth(0.7);
      fx.play("stamp", 40);
      return;
    }
    // Tous les boosters transformés : pas de cartes à révéler, la transformation propose la suite
    if (result.current.every((b) => b.cards.length === 0)) return;
    // Les cartes sorties du booster rejoignent la pile depuis leur place dans la scène
    const cards = reduced ? null : scene.current?.cards();
    const base = stageTop.current?.getBoundingClientRect();
    setDeckFrom(
      cards && base ? { x: cards.left - base.left, y: cards.top - base.top, width: cards.width, height: cards.height } : null,
    );
    setStage("reveal");
    setDepth(0.25);
    fx.play("whoosh");
  };

  const fail = (code: OpenBoosterError) => {
    setError(code);
    opened.current = false;
    setStage("ready");
    setDepth(0);
    setConfirmed(null);
    setAttempt((a) => a + 1); // nouveau booster intact
  };

  const trigger = async () => {
    setError(null);
    setNotice(null);
    setStage("opening");
    setDepth(0.15);
    result.current = null;
    if (sealedOpen) {
      // Action qui lève (serveur injoignable, panne) : la scène revient au booster intact
      const res = await openSealed({ drop: sealedOpen.id }).catch(() => ({ ok: false as const, error: "UNAVAILABLE" as const }));
      if (!res.ok) return fail(res.error);
      // Sachet déjà payé : le récap n'affiche pas les Zeni de l'ouverture précédente
      setZeniSpent(0);
      setKarma(res.karma);
      setOutcome(res.booster.apocalypse ?? null);
      omenRef.current = res.booster.apocalypse ?? null;
      setOpenedSealed(sealedOpen.kind);
      setBoosters([res.booster]);
      result.current = [res.booster];
      goReveal();
      return;
    }
    const res = await open(
      creditMode
        ? { booster: type.slug, count: effectiveCount, credit: true }
        : price.kind === "zeni"
          ? { booster: type.slug, count: effectiveCount, pay: true, expectedZeni: price.amount }
          : { booster: type.slug, count: effectiveCount },
    ).catch(() => ({ ok: false as const, error: "UNAVAILABLE" as const }));
    if (!res.ok) {
      // Prix changé depuis l'affichage (réglage de l'admin) : la page se recharge avec le nouveau prix à confirmer
      if (res.error === "PRICE_CHANGED") router.refresh();
      return fail(res.error);
    }
    // Sachets dessinables seulement : un type supprimé entre-temps reste dans l'inventaire de l'accueil
    dropsRef.current = res.drops.filter((d) => sealedTypes[d.kind]);
    setDrops(dropsRef.current);
    setOpenedSealed(null);
    setLatest(res.state);
    // Compteurs du serveur posés avant tout : même sans rien à montrer, les crédits ont été consommés
    setFeaturedCount(res.featuredCount);
    setZeniSpent(res.zeniSpent);
    setOpenedCredit(creditMode);
    setCreditLeft(creditMode ? res.credits : 0);
    // Rien à montrer ici (sachet tombé mais pas dessinable) : nouvelle scène, le sachet attend sur l'accueil
    if (dropsRef.current.length === 0 && res.boosters.every((b) => b.cards.length === 0)) {
      again();
      setNotice(tSealed("kept"));
      return;
    }
    setBoosters(res.boosters);
    result.current = res.boosters;
    goReveal();
  };

  const onOpened = () => {
    if (opened.current) return;
    opened.current = true;
    goReveal();
  };

  const { play } = fx;
  const onPrism = useCallback(() => {
    setPrismOn(true);
    setDepth(0.6);
    play("crackle", [30, 40, 30, 40, 120]);
  }, [play]);
  // Le « pop » du tremblement : la lumière éclate
  useEffect(() => {
    if (!prismOn) return;
    const id = setTimeout(() => play("launch", [60, 30, 140]), PRISM.popMs);
    return () => clearTimeout(id);
  }, [prismOn, play]);

  // Retour à la pénombre de la pile après une Mythique : annulé si la scène change avant (récap, autre booster)
  const mythicDim = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearMythicDim = useCallback(() => {
    if (mythicDim.current) clearTimeout(mythicDim.current);
    mythicDim.current = null;
  }, []);
  useEffect(() => clearMythicDim, [clearMythicDim]);

  const onMythic = useCallback(() => {
    setDepth(1);
    setShake((s) => s + 1);
    clearMythicDim();
    mythicDim.current = setTimeout(() => {
      mythicDim.current = null;
      setDepth(0.25);
    }, 2200);
  }, [clearMythicDim]);

  const toRecap = useCallback(() => {
    clearMythicDim();
    setStage("recap");
    setDepth(0);
  }, [clearMythicDim]);

  /** Nouveau booster intact ; `next` : sachet scellé à ouvrir sur la scène (sinon le booster de la page). */
  const again = (next: SealedTarget | null = null) => {
    wantFocus.current = true;
    opened.current = false;
    result.current = null;
    dropsRef.current = [];
    omenRef.current = null;
    transformSeen.current = false;
    omenSeen.current = false;
    // Le nouveau booster s'affiche sur le fond du rituel au repos (la transformation et la Mythique l'assombrissaient)
    clearMythicDim();
    setDepth(0);
    setPrismOn(false);
    setBoosters(null);
    setError(null);
    setConfirmed(null);
    setOutcome(null);
    setSealedOpen(next);
    setAttempt((a) => a + 1);
    setStage("ready");
  };

  /** Ouvre tout de suite un sachet tombé : il passe sur la scène, à déchirer comme un booster. */
  const openDrop = (d: DroppedSealedView) => {
    setDrops((list) => list.filter((x) => x.id !== d.id));
    again({ id: d.id, kind: d.kind });
  };

  /** Garde les sachets tombés pour plus tard : ils attendent sur l'accueil. */
  const keepDrops = () => {
    setDrops([]);
    again();
    setNotice(tSealed("kept"));
  };

  const continueAfterTransform = () => {
    transformSeen.current = true;
    goReveal();
  };

  const omenDone = () => {
    omenSeen.current = true;
    goReveal();
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

  // Réglage « auto » : on mesure la fluidité de l'appareil au repos (une fois, puis tous les 14 jours),
  // et pendant la révélation un appareil qui saccade passe en effets allégés pour la suite.
  useEffect(() => {
    if (pref !== "auto" || stage !== "ready" || hasMeasuredTier()) return;
    let stop = () => {};
    const id = setTimeout(() => (stop = probeFrames(1500)), 800);
    return () => {
      clearTimeout(id);
      stop();
    };
  }, [pref, stage]);
  useEffect(() => {
    if (pref !== "auto" || stage !== "reveal" || level !== "full") return;
    return watchFrames();
  }, [pref, stage, level]);

  // Même tableau d'un rendu à l'autre : la pile ne recalcule rien quand la scène change autour d'elle
  const deckCards = useMemo(() => boosters?.flatMap((booster) => booster.cards) ?? [], [boosters]);

  const first = boosters?.[0];
  const variant = first?.divine ? "divine" : first?.golden ? "golden" : undefined;
  const ritual = stage !== "recap";
  // Apocalyptique : ni lumière ni nacre pendant la déchirure, l'issue attend le sceau fendu
  const veiled = sealedOpen?.kind === "apocalypse";
  // Une XR dans l'ouverture (tous boosters confondus) : prisme sur le sachet
  const prism = !!boosters && !veiled && hasPrism(deckCards);
  const blessed = initialKarma.threshold > 0 && karma >= initialKarma.threshold;
  const firstDrop = drops[0];
  const dropDisplay = firstDrop ? sealedTypes[firstDrop.kind] : undefined;
  // Après un sachet, « Ouvrir un autre » revient au booster de la page
  const nextPrice: Price = sealedOpen ? (creditLeft > 0 ? { kind: "free" } : priceFor(type, state.stock, 1)) : unaffordable ? { kind: "unavailable" } : price;

  return (
    <LazyMotion features={domMax} strict>
      <RevealLayerContext.Provider value={revealLayer}>
      <AnimatePresence>
        {ritual && (
          <RitualBackdrop
            key="backdrop"
            depth={depth}
            reduced={reduced}
            lite={lite}
            tint={moment ? { id: moment.id, style: momentTint(moment.color), delay: TINT_DELAY } : null}
          />
        )}
      </AnimatePresence>

      {/* Fond des révélations plein écran : au-dessus du fond du rituel, sous la pile et la carte */}
      <div ref={setRevealLayer} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[46]" />

      {/* Une Mythique fait trembler la scène (le compteur change les images clés et relance l'animation).
          Au repos, une cible fixe plutôt que `undefined` : sinon Motion ne monte son animation qu'au premier
          tremblement, le prend pour un premier rendu et `initial={false}` l'annule. */}
      <m.div
        ref={stageTop}
        // Au-dessus du fond assombri pendant le rituel ; au récap, sous l'en-tête et la nav qui restent devant
        className={`relative flex scroll-mt-20 flex-col items-center gap-6 md:scroll-mt-24 ${ritual ? "z-50" : ""}`}
        initial={false}
        animate={reduced || shake === 0 ? { x: 0 } : { x: shake % 2 ? [0, -7, 7, -5, 5, -2, 0] : [0, 7, -7, 5, -5, 2, 0] }}
        transition={{ duration: 0.45 }}
      >
        <div className="reveal-chrome flex w-full items-center justify-end gap-2">
          <SettingsMenu />
          <SoundToggle enabled={fx.enabled} onChange={fx.setEnabled} />
        </div>

        {/* Région présente dès le départ (une région montée avec son texte n'est pas lue) : l'ouverture en cours, puis
            l'issue de l'Apocalyptique, que le sceau fendu montre sans texte à focaliser */}
        <p aria-live="polite" className="sr-only">
          {stage === "opening" ? t("opening") : stage === "omen" && outcome ? tSealed(outcome === "SPARED" ? "spared" : "ruined") : ""}
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
              // Tirage reçu : les cartes sorties restent affichées jusqu'à ce que la pile prenne le relais
              exit={reduced ? { opacity: 0 } : boosters ? { opacity: 1, transition: { duration: 0 } } : { opacity: 0, y: 80, scale: 0.9 }}
              transition={{ duration: 0.35 }}
            >
              <BoosterScene
                shape={shown.shape}
                theme={shown.theme}
                emblem={shown.emblem}
                name={shown.name}
                openLabel={t("openPack", { name: shown.name })}
                tagline={shown.tagline}
                contents={shown.contents}
                count={effectiveCount}
                armed={armed}
                reduced={reduced}
                lite={lite}
                leak={boosters && !veiled && deckCards.length > 0 ? bestRarity(boosters, rarities) : null}
                prism={prism}
                onPrism={onPrism}
                guarantee={!sealedDisplay && type.guaranteed === true}
                cards={boosters ? boosters.reduce((n, booster) => n + booster.cards.length, 0) : null}
                onTrigger={() => void trigger()}
                onOpened={onOpened}
                onTearSound={() => fx.play("tear", 15)}
                openRef={(h) => {
                  scene.current = h;
                }}
              />

              {stage === "ready" && (
                <div ref={readyActions} className="flex w-full max-w-sm flex-col items-center gap-4">
                  {notice && (
                    <p role="status" className="rounded-control border border-kin bg-surface px-3 py-2 text-center text-sm">
                      {notice}
                    </p>
                  )}
                  <p className="text-center text-sm text-text-muted">
                    {reduced ? t("hintReduced") : shown.shape === "SACHET" ? t("hint") : t("hintLift")}
                  </p>

                  {showPicker && (
                    <CountPicker
                      value={choice}
                      max={maxCount}
                      all={allCount}
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
                      meta={price.kind === "free" && !creditMode && !sealedOpen ? t("stockLeft", { count: state.stock }) : undefined}
                    >
                      {shown.shape === "SACHET" ? t("tear") : t("lift")}
                    </Button>
                  )}

                  {sealedOpen ? (
                    <p className={`flex items-center gap-1.5 text-center text-sm font-bold ${sealedOpen.kind === "divin" || blessed ? "text-kin" : "text-shu"}`}>
                      <span aria-hidden="true" lang="ja" className="font-seal">
                        {sealedGlyph(sealedOpen.kind)}
                      </span>
                      {sealedOpen.kind === "divin"
                        ? tSealed("readyDivin")
                        : blessed
                          ? tSealed("karmaBlessed")
                          : initialKarma.threshold > 0
                            ? tSealed("readyApocalypse", { current: karma, threshold: initialKarma.threshold })
                            : tSealed("readyApocalypseNoKarma")}
                    </p>
                  ) : creditMode ? (
                    <p className="flex items-center gap-1.5 text-sm font-bold text-kin">
                      <span aria-hidden="true" lang="ja" className="font-seal">
                        贈
                      </span>
                      {t("creditLeft", { count: creditLeft })}
                    </p>
                  ) : (
                    price.kind !== "free" && <PriceLine price={price} unaffordable={unaffordable} coins={state.coins} stock={state.stock} />
                  )}
                  {type.usesFreeStock && !creditMode && !sealedOpen && <NextFreeIn nextAt={state.nextAt} serverNow={state.serverNow} />}
                </div>
              )}
              {stage === "opening" && !boosters && (
                <p className="animate-pulse text-sm text-text-muted" aria-hidden="true">
                  {t("opening")}
                </p>
              )}
            </m.div>
          )}

          {stage === "transform" && firstDrop && dropDisplay && (
            <m.div key="transform" ref={landing} className="w-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <SealedTransform display={dropDisplay} more={drops.length - 1} lite={lite} reduced={reduced}>
                {deckCards.length > 0 ? (
                  // D'autres boosters ont des cartes : la pile d'abord, le sachet attend au récap
                  <Button variant="primary" size="lg" onClick={continueAfterTransform} className="w-full">
                    {tSealed("continue")}
                  </Button>
                ) : (
                  <>
                    <Button variant="primary" size="lg" onClick={() => openDrop(firstDrop)} className="w-full">
                      {tSealed("openNow")}
                    </Button>
                    <div className={`grid gap-2 ${giftLinks ? "grid-cols-2" : ""}`}>
                      <Button type="button" onClick={keepDrops}>
                        {tSealed("keep")}
                      </Button>
                      {giftLinks && (
                        <Link href={`/amis?sachet=${firstDrop.id}`} className={buttonClasses("secondary")}>
                          {tSealed("gift")}
                        </Link>
                      )}
                    </div>
                  </>
                )}
              </SealedTransform>
            </m.div>
          )}

          {stage === "reveal" && boosters && (
            <m.div
              key="reveal"
              className="flex w-full flex-col items-center"
              initial={deckFrom ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <CardDeck
                cards={deckCards}
                from={deckFrom}
                origin={stageTop}
                reduced={reduced}
                lite={lite}
                play={fx.play}
                onMythic={onMythic}
                onMoment={setMomentCard}
                onDone={toRecap}
              />
            </m.div>
          )}

          {stage === "recap" && boosters && (
            <m.div key="recap" ref={landing} className="w-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {fragments.length > 0 && <FrescoRecap drops={fragments} onReplay={setFrescoReplay} />}
              {drops.length > 0 && (
                <section aria-labelledby="recap-sealed" className="mx-auto mb-6 flex w-full max-w-md flex-col gap-2 rounded-card border border-kin bg-surface p-4">
                  <h2 id="recap-sealed" tabIndex={-1} className="flex items-center gap-2 font-title text-lg font-bold">
                    <span aria-hidden="true" lang="ja" className="font-seal text-kin">
                      封
                    </span>
                    {tSealed("recapTitle", { count: drops.length })}
                  </h2>
                  <ul className="flex flex-col gap-2">
                    {drops.map((d) => (
                      <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 font-bold">
                          <span aria-hidden="true" lang="ja" className="font-seal">
                            {sealedGlyph(d.kind)}
                          </span>
                          {sealedTypes[d.kind]?.name}
                        </span>
                        <span className="flex gap-2">
                          <Button type="button" size="sm" variant="primary" onClick={() => openDrop(d)}>
                            {tSealed("openNow")}
                          </Button>
                          {giftLinks && (
                            <Link href={`/amis?sachet=${d.id}`} className={buttonClasses("secondary", "", "sm")}>
                              {tSealed("gift")}
                            </Link>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-text-muted">{tSealed("recapKept")}</p>
                </section>
              )}
              <Recap
                name={shown.name}
                emblem={shown.emblem}
                boosters={boosters}
                state={state}
                reduced={reduced}
                play={fx.play}
                counters={
                  openedSealed
                    ? { pity: false, golden: false, featured: null }
                    : {
                        pity: type.countsForPity,
                        golden: type.bonusEligible && !openedCredit,
                        featured: type.featured
                          ? { left: Math.max(1, type.featured.threshold - featuredCount), threshold: type.featured.threshold }
                          : null,
                      }
                }
                zeniSpent={zeniSpent}
                choice={choice}
                maxCount={maxCount}
                allCount={allCount}
                onCount={(n) => {
                  setCount(n);
                  setConfirmed(null);
                }}
                // Comme sur l'écran prêt : seulement pour un booster du stock gratuit
                nextFree={type.usesFreeStock && !openedSealed && !openedCredit}
              />
              {isGuest && <GuestSignupPrompt invite={guestInvite} />}
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
      {variant === "golden" && ritual && !reduced && <GoldenDust key={`dust-${attempt}`} lite={lite} />}
      {prismOn && ritual && !reduced && !lite && <PrismWash key={`prism-${attempt}`} />}
      {stage === "omen" && outcome && <ApocalypseOmen key={`omen-${attempt}`} outcome={outcome} lite={lite} reduced={reduced} onDone={omenDone} />}
      {stage === "recap" && fragments.length > 0 && (frescoSeenFor !== boosters || frescoReplay !== null) && (
        <FrescoFragmentReveal
          key={`fresco-${attempt}-${frescoReplay ?? "first"}`}
          drops={fragments}
          start={frescoReplay ?? 0}
          onDone={() => {
            setFrescoSeenFor(boosters);
            setFrescoReplay(null);
          }}
        />
      )}
      {stage === "recap" && boosters && (
        <RecapActionBar
          count={sealedOpen ? 1 : effectiveCount}
          nextPrice={nextPrice}
          stock={creditMode || creditLeft > 0 ? null : state.stock}
          onAgain={pageOpenable ? () => again() : undefined}
          changeHref={`/?b=${type.slug}&f=${type.family}`}
          reduced={reduced}
        />
      )}
      </RevealLayerContext.Provider>
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
