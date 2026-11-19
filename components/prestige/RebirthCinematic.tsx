"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { cinematicBoxes, lightParticles, type CinematicBox } from "@/lib/prestige/cinematic";
import { toRoman } from "@/lib/prestige/roman";
import type { RebirthResultView } from "@/server/actions/prestige";
import { BoosterArt } from "../boosters/BoosterArt";
import { animate as animateOn, createTimeline, dispose, EASE, later, skip, SPRING, wait, type Timeline } from "../shop/celebration/timeline";
import { useReducedFx } from "../motion/MotionPreference";
import { useRitualFx } from "../opening/useRitualFx";
import { Button } from "../ui/Button";
import { ButtonLink } from "../ui/ButtonLink";
import { departedByRarity, type RarityInfo } from "./RebirthFlow";
import "./prestige.css";

/** Cartes dessinées au plus dans la nuée (le reste est compté, pas dessiné). */
const MAX_PARTICLES = 48;
/** Étalement de la nuée : fraction de la largeur et de la hauteur de l'écran (lib/prestige/cinematic.ts : rayon 55 à 95 %). */
const SPREAD_X = 0.46;
const SPREAD_Y = 0.42;

/** Poussière d'or qui monte après l'éclat : une paillette de la planche poudre-or par grain (comme l'aura du profil). */
const SPECKS = Array.from({ length: 18 }, (_, i) => {
  const cell = (i * 3) % 8;
  return {
    left: `${((i * 57.3 + 7) % 100).toFixed(1)}%`,
    size: 10 + (i % 4) * 4,
    cell: `${(((cell % 4) * 100) / 3).toFixed(2)}% ${cell < 4 ? 0 : 100}%`,
    d: `${(4.5 + (i % 5) * 1.1).toFixed(1)}s`,
    delay: `${(-((i * 0.61) % 6)).toFixed(2)}s`,
    dx: `${((i % 7) - 3) * 8}px`,
  };
});

/** Kanji des box (tous dans la police des sceaux, lib/seal-glyphs.ts). */
const BOX_SEAL: Record<Exclude<CinematicBox["kind"], "booster">, string> = { heirs: "継", printings: "摺", cosmetics: "飾", zeni: "銭" };

/**
 * Cinématique de renaissance, jouée après la transaction (tout est déjà décidé par le serveur). L'écran s'assombrit
 * jusqu'au noir ; les cartes recyclées, en silhouettes aux couleurs de leur rareté, deviennent des points de lumière
 * qui filent vers le centre et nourrissent un orbe ; il se tend puis éclate (flash, onde, éclat) ; au cœur, la plaque
 * kikkō en feuille d'or porte le nouveau chiffre romain, sur des rayons d'or qui tournent. Le titre s'écrit, le bloc
 * remonte et les box se révèlent une à une (héritières, gravées, badges, Zeni qui montent, booster offert). Un appui
 * passe la cinématique ; en mouvement réduit, l'état final s'affiche directement.
 */
export function RebirthCinematic({
  result,
  rarities,
  username,
  agreement,
  onClose,
}: {
  result: RebirthResultView;
  rarities: RarityInfo[];
  username: string;
  /** Accord du joueur (titres) : « Tu es passé » ou « Tu es passée ». */
  agreement: "MASC" | "FEM";
  /** Banc de l'admin : pas de lien de sortie, un bouton « Fermer ». */
  onClose?: () => void;
}) {
  const t = useTranslations("prestige.cinematic");
  const format = useFormatter();
  const reduced = useReducedFx();
  const { play } = useRitualFx();
  const root = useRef<HTMLDivElement>(null);
  const tl = useRef<Timeline | null>(null);

  const roman = toRoman(result.prestige);
  const particles = useMemo(
    () => lightParticles(departedByRarity(rarities, result.departed), MAX_PARTICLES, result.globalRank * 7919 + result.prestige),
    [rarities, result.departed, result.globalRank, result.prestige],
  );
  const boxes = cinematicBoxes({ heirs: result.heirs.length, printingsUnlocked: result.printingsUnlocked, zeni: result.zeni, booster: result.booster });

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const timeline = createTimeline(reduced);
    tl.current = timeline;
    // Démontée (ou rejouée deux fois par le mode strict en dev), la cinématique ne laisse rien derrière elle : le
    // déroulé abandonné file en mode passé, chaque animation qu'il crée encore est annulée et sa suite s'arrête
    let alive = true;
    const animate: typeof animateOn = (...args) => {
      const a = animateOn(...args);
      if (!alive) a.cancel();
      return a;
    };
    const q = <T extends Element = HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
    const qa = (sel: string) => [...el.querySelectorAll<HTMLElement>(sel)];
    const show = (node: Element, ms: number, from = "translateY(14px)") =>
      animate(timeline, node, [{ opacity: 0, transform: from }, { opacity: 1, transform: "none" }], { duration: ms });
    // Passée, la cinématique file sans bruit (sinon tous les sons partiraient d'un coup)
    const fx: typeof play = (name, haptic) => {
      if (!timeline.skipped) play(name, haptic);
    };

    const run = async () => {
      // Le bloc du logo part centré sur l'écran (là où converge la lumière), puis remontera à sa place
      const head = q("[data-head]");
      // Mesuré à sa place (un déroulé abandonné a pu le laisser décalé)
      head.style.transform = "";
      const emblem = q("[data-emblem]").getBoundingClientRect();
      const lift = window.innerHeight / 2 - (emblem.top + emblem.height / 2);
      head.style.transform = `translateY(${lift.toFixed(0)}px)`;

      // 1. L'écran s'assombrit jusqu'au noir
      fx("taiko", [30, 40, 30]);
      animate(timeline, q("[data-veil]"), [{ opacity: 0 }, { opacity: 1 }], { duration: 700, easing: "ease-in" });
      await wait(timeline, 350);

      // 2. Les cartes parties apparaissent en nuée autour du centre
      const nodes = qa("[data-p]");
      const w = window.innerWidth * SPREAD_X;
      const h = window.innerHeight * SPREAD_Y;
      const at = particles.map((p) => ({ x: p.x * w, y: p.y * h, r: p.rot, c: p.curve }));
      nodes.forEach((node, i) => {
        const { x, y, r } = at[i];
        animate(timeline, node, [{ opacity: 0, transform: `translate(${x}px,${y}px) rotate(${r}deg) scale(.6)` }, { opacity: 1, transform: `translate(${x}px,${y}px) rotate(${r}deg) scale(1)` }], {
          duration: 380,
          delay: i * 12,
        });
      });
      await wait(timeline, 650 + nodes.length * 12);

      // 3. Chaque carte devient un point de lumière et file vers le centre, en courbe ; l'orbe s'en nourrit
      const stream = 1_500;
      const flight = 900;
      const step = nodes.length > 1 ? stream / (nodes.length - 1) : 0;
      fx("whoosh");
      later(timeline, stream * 0.45, () => fx("whoosh"));
      later(timeline, stream * 0.9, () => fx("whoosh"));
      animate(timeline, q("[data-orb]"), [{ opacity: 0, transform: "scale(.1)" }, { opacity: 1, transform: "scale(1)" }], {
        duration: stream + flight,
        delay: flight * 0.6,
        easing: "cubic-bezier(.4,0,.9,.6)",
      });
      await Promise.all(
        nodes.map((node, i) => {
          const { x, y, r, c } = at[i];
          const mx = x * 0.5 - y * c;
          const my = y * 0.5 + x * c;
          const delay = i * step;
          animate(timeline, node.querySelector(".card")!, [{ opacity: 1 }, { opacity: 0 }], { duration: flight * 0.45, delay });
          animate(timeline, node.querySelector(".dot")!, [{ opacity: 0 }, { opacity: 1 }], { duration: flight * 0.35, delay });
          return animate(
            timeline,
            node,
            [
              { transform: `translate(${x}px,${y}px) rotate(${r}deg) scale(1)`, opacity: 1 },
              { transform: `translate(${mx.toFixed(1)}px,${my.toFixed(1)}px) rotate(${(r * 0.3).toFixed(0)}deg) scale(.85)`, opacity: 1, offset: 0.5 },
              { transform: `translate(${(x * 0.06).toFixed(1)}px,${(y * 0.06).toFixed(1)}px) rotate(0deg) scale(.5)`, opacity: 1, offset: 0.9 },
              { transform: "translate(0px,0px) rotate(0deg) scale(.3)", opacity: 0 },
            ],
            { duration: flight, delay, easing: "cubic-bezier(.5,0,.8,.45)" },
          ).finished;
        }),
      );

      // 4. L'orbe se tend… puis tout éclate
      fx("launch");
      await animate(timeline, q("[data-orb]"), [{ transform: "scale(1)" }, { transform: "scale(.78)", offset: 0.55 }, { transform: "scale(1.18)" }], {
        duration: 520,
        easing: "cubic-bezier(.6,0,.4,1)",
      }).finished;
      fx("boom", [40, 60, 140]);
      animate(timeline, q("[data-orb]"), [{ opacity: 1, transform: "scale(1.18)" }, { opacity: 0, transform: "scale(2.4)" }], { duration: 380, easing: "ease-out" });
      animate(timeline, q("[data-flash]"), [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 0 }], { duration: 900, easing: "ease-out" });
      animate(timeline, q("[data-burst]"), [{ opacity: 1, transform: "scale(.2)" }, { opacity: 0, transform: "scale(3.4)" }], { duration: 1_000, easing: "cubic-bezier(.1,.7,.3,1)" });
      animate(timeline, q("[data-wave]"), [{ opacity: 0.95, transform: "scale(.1)" }, { opacity: 0, transform: "scale(6)" }], { duration: 950, easing: "cubic-bezier(.1,.7,.3,1)" });

      // 5. Au cœur de l'éclat : la plaque d'or, ses rayons, la poussière d'or
      await wait(timeline, 110);
      fx("bell");
      animate(timeline, q("[data-rays]"), [{ opacity: 0, transform: "scale(.4)" }, { opacity: 1, transform: "scale(1)" }], { duration: 900, easing: EASE });
      animate(timeline, q("[data-glow]"), [{ opacity: 0 }, { opacity: 1 }], { duration: 700 });
      animate(timeline, q("[data-specks]"), [{ opacity: 0 }, { opacity: 1 }], { duration: 1_200 });
      await animate(timeline, q("[data-emblem]"), [{ opacity: 0, transform: "scale(2.3)" }, { opacity: 1, transform: "scale(1)" }], { duration: 640, easing: SPRING }).finished;
      fx("stamp", [20, 30]);
      show(q("[data-title]"), 480);
      await wait(timeline, 220);
      show(q("[data-rank]"), 420);
      await wait(timeline, 900);

      // 6. Le bloc remonte à sa place, les box se révèlent une à une
      animate(timeline, head, [{ transform: `translateY(${lift.toFixed(0)}px)` }, { transform: "translateY(0)" }], { duration: 850, easing: EASE });
      await wait(timeline, 380);
      for (const box of qa("[data-box]")) {
        if (timeline.skipped) break;
        fx("chime");
        show(box, 420);
        if (box.dataset.box === "zeni") {
          const num = box.querySelector<HTMLElement>("[data-zeni]");
          if (result.zeni > 0) fx("coin");
          for (let k = 1; k <= 14 && !timeline.skipped; k++) {
            if (num) num.textContent = format.number(Math.round((result.zeni * k) / 14));
            await wait(timeline, 45);
          }
          if (num) num.textContent = format.number(result.zeni);
        }
        await wait(timeline, 300);
      }
      // Passée en cours de route : les box restantes s'affichent d'un coup, les Zeni à leur valeur
      if (timeline.skipped) {
        for (const box of qa("[data-box]")) show(box, 0);
        const num = el.querySelector<HTMLElement>("[data-zeni]");
        if (num) num.textContent = format.number(result.zeni);
      }

      // 7. Fin
      await animate(timeline, q("[data-done]"), [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 380 }).finished;
      el.querySelector<HTMLElement>("[data-done] a, [data-done] button")?.focus();
    };
    run().catch(() => undefined);
    return () => {
      alive = false;
      dispose(timeline);
    };
    // La cinématique ne se joue qu'une fois, avec le résultat reçu
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const boxContent = (box: CinematicBox): ReactNode => {
    switch (box.kind) {
      case "heirs":
        return t("heirs", { count: box.count });
      case "printings":
        return t("printings");
      case "cosmetics":
        return t("cosmetics");
      case "zeni":
        return t.rich("zeni", {
          zeni: format.number(box.zeni),
          num: (chunks) => (
            <b data-zeni className="tabular-nums text-kin">
              {chunks}
            </b>
          ),
        });
      case "booster":
        return t("booster", { count: box.booster.count, name: box.booster.name });
    }
  };

  return (
    <div ref={root} role="dialog" aria-modal="true" aria-label={t("label")} className="pr-cine" onClick={() => tl.current && skip(tl.current)}>
      <span data-veil className="pr-cine-veil" />

      {/* Nuée des cartes parties, puis points de lumière : centrée sur l'écran */}
      <div className="pr-cine-field" aria-hidden="true">
        {particles.map((p, i) => (
          <span key={i} data-p className="pr-cine-p" style={{ "--pr-c": p.color } as CSSProperties}>
            <i className="card" />
            <i className="dot" />
          </span>
        ))}
        <span data-orb className="pr-cine-orb" />
        <span data-wave className="pr-cine-wave" />
        <span data-burst className="pr-cine-burst" />
      </div>
      <span data-flash className="pr-cine-flash" aria-hidden="true" />

      <div data-specks className="pr-cine-specks" aria-hidden="true">
        {SPECKS.map((s, i) => (
          <span
            key={i}
            className="pr-speck"
            style={{ left: s.left, width: s.size, height: s.size, backgroundPosition: s.cell, "--pr-d": s.d, "--pr-delay": s.delay, "--pr-dx": s.dx } as CSSProperties}
          />
        ))}
      </div>

      <div className="pr-cine-stage">
        <div data-head className="pr-cine-head">
          <div className="pr-cine-crest">
            <span data-glow className="pr-cine-glow" aria-hidden="true" />
            <span data-rays className="pr-cine-rays" aria-hidden="true" />
            <span data-emblem className="pr-cine-emblem" aria-hidden="true">
              <span lang="ja" className="pr-cine-seal font-seal">
                転生
              </span>
              <span className="pr-cine-plate font-title">
                <span>{roman}</span>
              </span>
            </span>
          </div>
          <h2 data-title className="pr-cine-title font-heading">
            {t("title", { agreement, roman })}
          </h2>
          <p data-rank className="pr-cine-rank">
            {t("rank", { rank: result.globalRank })}
          </p>
        </div>

        <ul className="pr-cine-boxes">
          {boxes.map((box) => (
            <li key={box.kind} data-box={box.kind} className={`pr-cine-box${box.kind === "booster" ? " is-booster" : ""}`}>
              {box.kind === "booster" ? (
                <span className="w-10 shrink-0">
                  <BoosterArt shape={box.booster.shape} theme={box.booster.theme} emblem={box.booster.emblem} name={box.booster.name} contents={box.booster.contents} compact flatShadow />
                </span>
              ) : (
                <span aria-hidden="true" lang="ja" className="pr-cine-box-seal font-seal">
                  {BOX_SEAL[box.kind]}
                </span>
              )}
              <span className="min-w-0 text-sm font-bold">{boxContent(box)}</span>
            </li>
          ))}
        </ul>

        <div data-done className="pr-cine-done">
          {onClose ? (
            <Button
              type="button"
              variant="primary"
              className="w-full max-w-xs"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
            >
              {t("close")}
            </Button>
          ) : (
            <>
              {result.booster && (
                <ButtonLink href={`/ouvrir/${result.booster.slug}?credit=1`} variant="primary" className="w-full max-w-xs" onClick={(e) => e.stopPropagation()}>
                  {t("openBooster")}
                </ButtonLink>
              )}
              <ButtonLink href={`/u/${username}`} variant={result.booster ? "secondary" : "primary"} className="w-full max-w-xs" onClick={(e) => e.stopPropagation()}>
                {t("profile")}
              </ButtonLink>
            </>
          )}
        </div>
      </div>

      <button
        type="button"
        autoFocus
        onClick={(e) => {
          e.stopPropagation();
          if (tl.current) skip(tl.current);
        }}
        className="pr-skip absolute top-[calc(0.75rem+env(safe-area-inset-top,0px))] right-[max(0.75rem,env(safe-area-inset-right,0px))] min-h-11 rounded-pill px-4 text-sm text-[#a89f92]"
      >
        {t("skip")}
      </button>
    </div>
  );
}
