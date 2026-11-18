"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import type { FudaCard } from "@/components/fuda/Fuda";
import { animate, createTimeline, dispose, skip, SPRING, wait, type Timeline } from "../shop/celebration/timeline";
import { Fuda } from "../fuda/Fuda";
import { useReducedFx } from "../motion/MotionPreference";
import { useRitualFx } from "../opening/useRitualFx";
import { ButtonLink } from "../ui/ButtonLink";
import "./prestige.css";

/**
 * Rite de consécration (奉納), joué après la transaction : la carte s'élève, sa fleur de prunier d'or s'illumine, la corde
 * shimenawa descend, la cloche sonne, le sceau 奉納 se pose ; puis le lien vers le sanctuaire du profil. Un appui passe
 * le rite ; en mouvement réduit, l'état final s'affiche directement.
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
    const q = (sel: string) => el.querySelector(sel)!;
    const run = async () => {
      animate(timeline, q("[data-dim]"), [{ opacity: 0 }, { opacity: 0.86 }], { duration: 450 });
      play("chime");
      // La carte s'élève, sa marque s'illumine
      await animate(timeline, q("[data-relic]"), [
        { opacity: 0, transform: "translateY(60px) scale(.86)" },
        { opacity: 1, transform: "translateY(0) scale(1)" },
      ], { duration: 900, easing: "cubic-bezier(.2,.8,.25,1)" }).finished;
      animate(timeline, q("[data-halo]"), [{ opacity: 0, transform: "scale(.6)" }, { opacity: 1, transform: "scale(1)" }], { duration: 700 });
      await wait(timeline, 350);
      // La corde descend, la cloche sonne
      await animate(timeline, q("[data-rope]"), [{ transform: "translateY(-140%)" }, { transform: "translateY(0)" }], { duration: 650, easing: SPRING }).finished;
      play("bell", [20, 40, 20]);
      await wait(timeline, 300);
      // Le sceau 奉納 se pose
      await animate(timeline, q("[data-seal]"), [
        { opacity: 0, transform: "scale(2.6) rotate(-22deg)" },
        { opacity: 1, transform: "scale(1) rotate(-6deg)" },
      ], { duration: 320, easing: SPRING }).finished;
      play("stamp", 40);
      await animate(timeline, q("[data-done]"), [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 350 }).finished;
      el.querySelector<HTMLElement>("[data-done] a")?.focus();
    };
    run().catch(() => undefined);
    return () => dispose(timeline);
    // Le rite ne se joue qu'une fois
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={root} role="dialog" aria-modal="true" aria-label={t("label")} className="pr-rite pr-consecrate" onClick={() => tl.current && skip(tl.current)}>
      <span data-dim className="pr-rite-dim" />
      <span data-rope aria-hidden="true" className="pr-shimenawa pr-rite-rope">
        <i />
        <i />
        <i />
        <i />
      </span>
      <div className="pr-inner items-center justify-center">
        <div className="relative mt-16 w-44">
          <span data-halo aria-hidden="true" className="pr-relic-halo" />
          <div data-relic className="relative">
            <Fuda card={card} size="md" still describeImage />
          </div>
          <span data-seal aria-hidden="true" lang="ja" className="pr-hono-seal font-seal">
            奉納
          </span>
        </div>
        <div data-done className="mt-auto flex flex-col items-center gap-2 pb-2 text-center opacity-0">
          <b className="font-heading text-2xl">{t("done")}</b>
          <span className="text-sm text-[#a89f92]">{t("doneText", { name: card.name })}</span>
          <ButtonLink href={`/u/${username}#sanctuaire`} variant="primary" className="w-full max-w-xs" onClick={(e) => e.stopPropagation()}>
            {t("sanctuary")}
          </ButtonLink>
        </div>
      </div>
      <button
        type="button"
        autoFocus
        onClick={(e) => {
          e.stopPropagation();
          if (tl.current) skip(tl.current);
        }}
        className="absolute top-[calc(0.75rem+env(safe-area-inset-top,0px))] right-[max(0.75rem,env(safe-area-inset-right,0px))] min-h-11 rounded-pill px-4 text-sm text-[#a89f92]"
      >
        {t("skip")}
      </button>
    </div>
  );
}
