"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import type { FudaCard } from "@/components/fuda/Fuda";
import { PRESTIGE_ASSETS } from "@/lib/prestige/assets";
import { animate as animateOn, createTimeline, dispose, skip, SPRING, wait, type Timeline } from "../shop/celebration/timeline";
import { Fuda } from "../fuda/Fuda";
import { useReducedFx } from "../motion/MotionPreference";
import { useRitualFx } from "../opening/useRitualFx";
import { ButtonLink } from "../ui/ButtonLink";
import "./prestige.css";

/**
 * Rite de consécration (奉納), montée à l'autel, joué après la transaction dans le vrai sanctuaire (fond généré) : les
 * lanternes s'embrasent, un rayon d'or tombe sur la carte qui s'élève, la cloche sonne, puis la carte va prendre la place
 * du haut de l'autel à gradins et le sceau 奉納 se pose dans un éclat ; enfin le lien vers le sanctuaire du profil. Un
 * appui passe le rite ; en mouvement réduit, l'état final s'affiche directement, sans bruit.
 *
 * Rendu dans le <dialog> modal de ConsecrationRiteHost, qui porte le rôle et le libellé.
 */
export function ConsecrationRite({ card, username }: { card: FudaCard; username: string }) {
  const t = useTranslations("prestige.consecrate.rite");
  const reduced = useReducedFx();
  const { play } = useRitualFx();
  const root = useRef<HTMLDivElement>(null);
  const tl = useRef<Timeline | null>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const timeline = createTimeline(reduced);
    tl.current = timeline;
    // Démonté (Échap, ou rejoué deux fois par le mode strict en dev), le rite ne laisse rien derrière lui : le déroulé
    // abandonné file en mode passé, chaque animation qu'il crée encore est annulée et sa suite s'arrête
    let alive = true;
    const animate: typeof animateOn = (...args) => {
      const a = animateOn(...args);
      if (!alive) a.cancel();
      return a;
    };
    // Passé (appui, mouvement réduit), le rite file sans bruit (sinon tous les sons partiraient d'un coup)
    const fx: typeof play = (name, haptic) => {
      if (!timeline.skipped) play(name, haptic);
    };
    const q = <T extends Element = HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
    // Le dialogue de l'hôte s'ouvre sur son premier élément focalisable, le lien de fin encore invisible : le focus va
    // sur « Passer » (autoFocus ne suffit pas, il agit avant l'ouverture du dialogue)
    q("[data-skip]").focus();
    const run = async () => {
      fx("taiko", [30, 40, 30]);
      animate(timeline, q("[data-dim]"), [{ opacity: 0 }, { opacity: 0.35 }], { duration: 420 });
      await wait(timeline, 300);
      // Les lanternes s'embrasent
      fx("lamp");
      await animate(timeline, q("[data-bloom]"), [{ opacity: 0 }, { opacity: 1 }], { duration: 700 }).finished;
      // La carte s'élève dans son halo, sous un rayon d'or
      fx("chime");
      animate(timeline, q("[data-halo]"), [{ opacity: 0, transform: "scale(.6)" }, { opacity: 1, transform: "scale(1)" }], { duration: 900 });
      animate(timeline, q("[data-ray]"), [{ opacity: 0 }, { opacity: 1 }], { duration: 900 });
      const relic = q("[data-relic]");
      await animate(timeline, relic, [{ opacity: 0, transform: "translateY(60px) scale(.9)" }, { opacity: 1, transform: "translateY(0) scale(1)" }], { duration: 900, easing: "cubic-bezier(.2,.8,.25,1)" }).finished;
      // La cloche sonne
      fx("bell", [20, 40, 20]);
      await animate(timeline, q("[data-suzu]"), [
        { transform: "rotate(0)" },
        { transform: "rotate(9deg)" },
        { transform: "rotate(-7deg)" },
        { transform: "rotate(5deg)" },
        { transform: "rotate(-2deg)" },
        { transform: "rotate(0)" },
      ], { duration: 900, easing: "ease-out" }).finished;
      // Elle prend la place du haut de l'autel : translation et échelle calculées depuis sa position de repos
      const from = relic.getBoundingClientRect();
      const to = q("[data-slot]").getBoundingClientRect();
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 2 - (from.top + from.height / 2);
      fx("whoosh");
      animate(timeline, q("[data-halo]"), [{ opacity: 1 }, { opacity: 0 }], { duration: 820 });
      animate(timeline, q("[data-ray]"), [{ opacity: 1 }, { opacity: 0 }], { duration: 820 });
      animate(timeline, q("[data-dim]"), [{ opacity: 0.35 }, { opacity: 0 }], { duration: 820 });
      await animate(timeline, relic, [{ transform: "translate(0, 0) scale(1)" }, { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${(to.width / from.width).toFixed(3)})` }], {
        duration: 820,
        easing: "cubic-bezier(.5,0,.2,1)",
      }).finished;
      // Éclat, puis le sceau 奉納 à côté de sa place
      const cx = to.left + to.width / 2;
      const cy = to.top + to.height / 2;
      const burst = q("[data-burst]");
      burst.style.left = `${cx}px`;
      burst.style.top = `${cy}px`;
      const seal = q("[data-seal]");
      seal.style.left = `${cx + to.width * 0.62}px`;
      seal.style.top = `${cy - 4}px`;
      animate(timeline, q("[data-slot-glow]"), [{ opacity: 0 }, { opacity: 1 }], { duration: 400 });
      animate(timeline, burst, [{ opacity: 0, transform: "scale(.4)" }, { opacity: 1, transform: "scale(1)", offset: 0.35 }, { opacity: 0, transform: "scale(1.25)" }], { duration: 900, easing: "ease-out" });
      await wait(timeline, 260);
      fx("stamp", 40);
      await animate(timeline, seal, [{ opacity: 0, transform: "scale(2.4) rotate(-20deg)" }, { opacity: 1, transform: "scale(1) rotate(-6deg)" }], { duration: 320, easing: SPRING }).finished;
      await animate(timeline, q("[data-done]"), [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 350 }).finished;
      el.querySelector<HTMLElement>("[data-done] a")?.focus();
    };
    run().catch(() => undefined);
    return () => {
      alive = false;
      dispose(timeline);
    };
    // Le rite ne se joue qu'une fois
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scene = PRESTIGE_ASSETS.sanctuary;
  return (
    <div ref={root} className="pr-rite pr-consecrate" onClick={() => tl.current && skip(tl.current)}>
      {/* Le sanctuaire du profil : portrait sur téléphone, paysage sur un écran large */}
      <picture className="pr-cs-bg">
        <source media="(orientation: landscape)" srcSet={scene.desktop.still} />
        <img src={scene.mobile.still} alt="" decoding="async" draggable={false} />
      </picture>
      <span data-bloom aria-hidden="true" className="pr-cs-bloom" />
      <span data-dim className="pr-rite-dim" />
      <span data-ray aria-hidden="true" className="pr-cs-ray" />
      <span data-suzu aria-hidden="true" className="pr-cs-suzu" />
      <div aria-hidden="true" className="pr-cs-altar">
        <span data-slot className="pr-cs-slot">
          <i data-slot-glow />
        </span>
      </div>
      <div data-relic className="pr-cs-card">
        <span data-halo aria-hidden="true" className="halo" />
        <Fuda card={card} size="md" still describeImage />
      </div>
      <span data-burst aria-hidden="true" className="pr-cs-burst" />
      <span data-seal aria-hidden="true" lang="ja" className="pr-cs-seal font-seal">
        奉納
      </span>
      <div data-done className="pr-cs-done flex flex-col items-center gap-2 text-center opacity-0">
        <b className="font-heading text-2xl">{t("done")}</b>
        <span className="text-sm text-[#d9cfbe]">{t("doneText", { name: card.name })}</span>
        <ButtonLink href={`/u/${username}#sanctuaire`} variant="primary" className="w-full max-w-xs" onClick={(e) => e.stopPropagation()}>
          {t("sanctuary")}
        </ButtonLink>
      </div>
      <button
        type="button"
        data-skip
        onClick={(e) => {
          e.stopPropagation();
          if (tl.current) skip(tl.current);
        }}
        className="pr-skip absolute top-[calc(0.75rem+env(safe-area-inset-top,0px))] right-[max(0.75rem,env(safe-area-inset-right,0px))] min-h-11 rounded-pill px-4 text-sm text-[#d9cfbe]"
      >
        {t("skip")}
      </button>
    </div>
  );
}
