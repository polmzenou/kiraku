"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, type CSSProperties } from "react";
import type { FrameStyle } from "@/lib/profile/frames";
import { toRoman } from "@/lib/prestige/roman";
import type { RebirthResultView } from "@/server/actions/prestige";
import { animate, createTimeline, dispose, removeWhenDone, skip, SPRING, wait, type Timeline } from "../shop/celebration/timeline";
import { Fuda, HeritageSeam } from "../fuda/Fuda";
import { useReducedFx } from "../motion/MotionPreference";
import { useRitualFx } from "../opening/useRitualFx";
import { PlayerAvatar } from "../social/PlayerAvatar";
import { ButtonLink } from "../ui/ButtonLink";
import type { RarityInfo } from "./RebirthFlow";
import "./prestige.css";

/**
 * Rite de renaissance (転生), joué après la transaction (tout est déjà décidé par le serveur). Les piles de cartes,
 * une par rareté, se replient et partent au brasero ; les Zeni montent ; les héritières reçoivent leur veine d'or ;
 * le chiffre romain est frappé sur l'avatar ; le rouleau du cycle se déroule. Un appui passe le rite ; en mouvement
 * réduit, l'état final s'affiche directement.
 */
export function RebirthRite({
  result,
  previous,
  rarities,
  player,
}: {
  result: RebirthResultView;
  previous: number;
  rarities: RarityInfo[];
  player: { username: string; image: string | null; frame: FrameStyle | null };
}) {
  const t = useTranslations("prestige.rite");
  const format = useFormatter();
  const reduced = useReducedFx();
  const { play } = useRitualFx();
  const root = useRef<HTMLDivElement>(null);
  const tl = useRef<Timeline | null>(null);

  const piles = rarities
    .map((r) => ({ ...r, count: result.departed.filter((d) => d.rarity === r.key).reduce((sum, d) => sum + d.count, 0) }))
    .filter((r) => r.count > 0);
  const gone = piles.reduce((sum, p) => sum + p.count, 0);
  const heirs = result.heirs.slice(0, 20);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const timeline = createTimeline(reduced);
    tl.current = timeline;
    const q = <T extends Element>(sel: string) => el.querySelector<T>(sel);
    const qa = (sel: string) => [...el.querySelectorAll<HTMLElement>(sel)];
    const zeniNum = q<HTMLElement>("[data-zeni]");
    const level = q<HTMLElement>("[data-level]");

    const run = async () => {
      play("taiko", [30, 40, 30]);
      animate(timeline, q("[data-dim]")!, [{ opacity: 0 }, { opacity: 0.42 }], { duration: 400 });
      await wait(timeline, 250);
      animate(timeline, q("[data-fire]")!, [{ opacity: 0, transform: "translateY(20px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 450 });
      play("lamp");
      await wait(timeline, 500);

      // Les piles partent au brasero, l'une après l'autre ; des braises montent à chaque arrivée
      const bowl = q("[data-bowl]")!.getBoundingClientRect();
      const host = el.getBoundingClientRect();
      const fx = bowl.left + bowl.width / 2;
      const fy = bowl.top + 4;
      const stacks = qa("[data-stack]");
      await Promise.all(
        stacks.map(async (stack, i) => {
          await wait(timeline, i * 150);
          const r = stack.getBoundingClientRect();
          const dx = fx - (r.left + r.width / 2);
          const dy = fy - (r.top + r.height / 2);
          play("whoosh");
          await animate(
            timeline,
            stack,
            [
              { transform: "translate(0,0) rotate(0deg) scale(1)", opacity: 1 },
              { transform: `translate(${(dx * 0.35).toFixed(0)}px,-46px) rotate(${i % 2 ? -18 : 16}deg) scale(.8,.5)`, opacity: 1, offset: 0.4 },
              { transform: `translate(${dx.toFixed(0)}px,${dy.toFixed(0)}px) rotate(${i % 2 ? 40 : -36}deg) scale(.25)`, opacity: 0 },
            ],
            { duration: 720, easing: "cubic-bezier(.45,0,.8,.7)" },
          ).finished;
          if (timeline.skipped) return;
          play("crackle");
          for (let k = 0; k < 8; k++) {
            const ember = document.createElement("span");
            ember.className = "pr-ember";
            ember.style.left = `${fx - host.left}px`;
            ember.style.top = `${fy - host.top}px`;
            el.append(ember);
            const ex = (Math.random() - 0.5) * 110;
            const ey = -(90 + Math.random() * 150);
            removeWhenDone(
              animate(timeline, ember, [{ transform: "translate(0,0) scale(1)", opacity: 1 }, { transform: `translate(${ex.toFixed(0)}px,${ey.toFixed(0)}px) scale(.3)`, opacity: 0 }], {
                duration: 900 + Math.random() * 600,
                easing: "ease-out",
              }),
              ember,
            );
          }
        }),
      );

      // Les Zeni montent
      animate(timeline, q("[data-zeni-box]")!, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
      if (result.zeni > 0) play("coin");
      for (let k = 1; k <= 10 && !timeline.skipped; k++) {
        if (zeniNum) zeniNum.textContent = format.number(Math.round((result.zeni * k) / 10));
        await wait(timeline, 55);
      }
      if (zeniNum) zeniNum.textContent = format.number(result.zeni);

      // Les héritières reçoivent leur veine d'or
      play("chime");
      await Promise.all(
        qa("[data-heir]").map(async (card, i) => {
          await wait(timeline, i * 85);
          animate(timeline, card, [{ transform: "scale(1)" }, { transform: "scale(1.09)", offset: 0.4 }, { transform: "scale(1)" }], { duration: 420 });
          const vein = card.querySelector(".pr-new-vein");
          if (vein) await animate(timeline, vein, [{ opacity: 0 }, { opacity: 1 }], { duration: 380 }).finished;
        }),
      );
      await wait(timeline, 200);

      // Le chiffre romain est frappé sur l'avatar
      play("stamp", [20, 30, 60]);
      animate(timeline, q("[data-next]")!, [{ opacity: 0 }, { opacity: 1 }], { duration: 120 });
      const oldPlate = q("[data-old] .prestige-plate");
      if (oldPlate) animate(timeline, oldPlate, [{ opacity: 1 }, { opacity: 0 }], { duration: 120 });
      const plate = q("[data-next] .prestige-plate");
      if (plate) await animate(timeline, plate, [{ transform: "scale(3) rotate(-16deg)", opacity: 0 }, { transform: "scale(1) rotate(0deg)", opacity: 1 }], { duration: 420, easing: SPRING }).finished;
      if (level) level.textContent = t("level", { level: result.prestige });

      // Le rouleau du cycle se déroule
      animate(timeline, q("[data-fire]")!, [{ opacity: 1 }, { opacity: 0 }], { duration: 350 });
      const emaki = q<HTMLElement>("[data-emaki]")!;
      await animate(timeline, emaki, [{ opacity: 0 }, { opacity: 1 }], { duration: 150 }).finished;
      const move = [{ transform: "translateX(0)" }, { transform: `translateX(${emaki.clientWidth - 12}px)` }];
      play("tear");
      await Promise.all([
        animate(timeline, q("[data-rod]")!, move, { duration: 900, easing: "cubic-bezier(.3,.7,.2,1)" }).finished,
        animate(timeline, q("[data-cover]")!, move, { duration: 900, easing: "cubic-bezier(.3,.7,.2,1)" }).finished,
      ]);
      play("bell");
      await animate(timeline, q("[data-done]")!, [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 350 }).finished;
      q<HTMLElement>("[data-done] a")?.focus();
    };
    run().catch(() => undefined);
    return () => dispose(timeline);
    // Le rite ne se joue qu'une fois, avec le résultat reçu
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={t("label")}
      className="pr-rite"
      onClick={() => tl.current && skip(tl.current)}
    >
      <span data-dim className="pr-rite-dim" />
      <div className="pr-inner">
        <div className="flex items-center gap-4 pt-2">
          <span className="relative inline-flex">
            <span data-old>
              <PlayerAvatar username={player.username} image={player.image} size={64} frame={player.frame} prestige={previous} />
            </span>
            <span data-next className="absolute inset-0 opacity-0">
              <PlayerAvatar username={player.username} image={player.image} size={64} frame={player.frame} prestige={result.prestige} />
            </span>
          </span>
          <div className="flex min-w-0 flex-col">
            <b className="truncate font-heading text-xl">{player.username}</b>
            <span data-level className="text-sm font-bold text-kin">
              {previous > 0 ? t("level", { level: previous }) : t("firstCycle")}
            </span>
          </div>
        </div>

        <p className="text-xs font-bold tracking-widest text-[#a89f92] uppercase">{t("heirs", { count: heirs.length })}</p>
        <div className="pr-heirs">
          {heirs.map((h) => (
            <div key={h.userCardId} data-heir className="relative">
              <Fuda card={{ ...h.card, copy: { heritage: h.before } }} size="sm" still describeImage />
              {h.after > h.before && <HeritageSeam index={h.before} className="pr-new-vein" />}
            </div>
          ))}
        </div>

        <p className="text-xs font-bold tracking-widest text-[#a89f92] uppercase">{t("gone", { count: gone })}</p>
        <div className="pr-piles">
          {piles.map((p) => (
            <div key={p.key} className="pr-pile" style={{ "--pr-color": p.color } as CSSProperties}>
              <span data-stack className="stack" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>
                <span aria-hidden="true" lang="ja" className="font-seal">
                  {p.seal}
                </span>{" "}
                {format.number(p.count)}
              </span>
            </div>
          ))}
        </div>

        <p data-zeni-box className="flex items-center gap-2 font-bold tabular-nums opacity-0">
          <span aria-hidden="true" className="size-4 rounded-full bg-[radial-gradient(circle,transparent_0_26%,#d9b556_28%)] shadow-[inset_0_0_0_1px_#8a6a1f]" />
          <b data-zeni>0</b> {t("zeni")}
        </p>

        <div data-emaki className="pr-emaki">
          <div className="paper">
            <span aria-hidden="true" lang="ja" className="grid h-14 w-10 shrink-0 place-items-center rounded-[4px] bg-shu-btn font-seal text-lg text-washi-paper [writing-mode:vertical-rl]">
              転生
            </span>
            <div className="min-w-0">
              <b className="block font-title text-xl font-extrabold">{t("cycle", { roman: toRoman(result.prestige) })}</b>
              <span className="text-xs text-[#5b544a]">{t("rank", { rank: result.globalRank })}</span>
            </div>
          </div>
          <span data-cover className="cover" />
          <span className="rod" />
          <span data-rod className="rod" />
        </div>

        <div data-done className="mt-auto flex flex-col items-center gap-2 pb-2 text-center opacity-0">
          <b className="font-heading text-2xl">{t("done", { roman: toRoman(result.prestige) })}</b>
          <span className="text-sm text-[#a89f92]">{t("doneText")}</span>
          <ButtonLink href={`/u/${player.username}`} variant="primary" className="w-full max-w-xs" onClick={(e) => e.stopPropagation()}>
            {t("profile")}
          </ButtonLink>
        </div>
      </div>

      <div data-fire className="pr-fire" aria-hidden="true">
        <span className="glow" />
        <span className="pr-flame f2" />
        <span className="pr-flame f3" />
        <span className="pr-flame" />
        <span data-bowl className="bowl" />
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
