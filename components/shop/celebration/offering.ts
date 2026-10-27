import type { SoundName } from "@/lib/sound/synth";
import { badgeIn, centerIn, fanOut, flakes, resultIn, ring, shake, span, stampIn } from "./particles";
import { animate, later, removeWhenDone, wait, type Timeline } from "./timeline";

/** Ce que toutes les scènes animent : la scène, le calque des particules, les sachets, le sceau et le résumé. */
export type SceneNodes = {
  world: HTMLElement;
  fx: HTMLElement;
  /** Sachets déjà rendus (BoosterArt), invisibles jusqu'à l'éventail. */
  fan: HTMLElement[];
  badge: HTMLElement | null;
  stamp: HTMLElement;
  result: HTMLElement;
};

export type RunOptions = {
  /** Boosters reçus, selon la réponse du serveur. */
  total: number;
  /** Effets allégés : moitié moins de particules. */
  lite: boolean;
  play: (name: SoundName, haptic?: number | number[]) => void;
  /** Le résumé arrive : le solde commence à défiler. */
  onResult: () => void;
};

export type OfferingNodes = SceneNodes & {
  dim: HTMLElement;
  rays: HTMLElement;
  pillar: HTMLElement;
  rope: HTMLElement;
  bell: HTMLElement;
  box: HTMLElement;
  boxGlow: HTMLElement;
};

/**
 * 賽銭 L'offrande : payer devient le rituel du sanctuaire. Les Zeni volent dans la boîte à offrandes, la
 * cloche sonne, deux claquements de mains font trembler la scène, une colonne de lumière s'élève et les
 * boosters en sortent en éventail ; le sceau 済 s'abat dans une gerbe d'or.
 */
export async function runOffering(tl: Timeline, n: OfferingNodes, o: RunOptions) {
  const W = n.world.clientWidth;
  const H = n.world.clientHeight;
  const box = centerIn(n.box, n.world);
  const slot = { x: box.x, y: box.y - n.box.offsetHeight * 0.38 };
  const bell = centerIn(n.bell, n.world);

  animate(tl, n.dim, [{ opacity: 0 }, { opacity: 1 }], { duration: 420 });
  animate(tl, n.box, [{ transform: "translateY(28px)", opacity: 0 }, { transform: "translateY(0)", opacity: 1 }], { duration: 480 });
  animate(tl, n.rope, [{ transform: "translateY(-40%)", opacity: 0 }, { transform: "translateY(0)", opacity: 1 }], { duration: 480 });
  await wait(tl, 260);

  // Les pièces volent en arc depuis le bouton d'achat et tintent en tombant dans la fente
  const coins = Math.min(7, Math.max(3, o.total));
  for (let i = 0; i < coins; i++) {
    const coin = span(n.fx, "cel-coin");
    const h = 11;
    const x0 = W * 0.86 - (i % 3) * 10;
    const y0 = H * 0.98;
    const x1 = slot.x + (i - (coins - 1) / 2) * 5;
    const y1 = slot.y;
    const peak = Math.min(y0, y1) - H * (0.26 + (i % 3) * 0.05);
    const mid = (x0 + x1) / 2 + W * 0.04;
    removeWhenDone(
      animate(
        tl,
        coin,
        [
          { transform: `translate(${x0 - h}px, ${y0 - h}px) rotate(0deg) scale(.9)`, opacity: 0 },
          { transform: `translate(${x0 - h}px, ${y0 - h}px) rotate(0deg) scale(1)`, opacity: 1, offset: 0.06 },
          { transform: `translate(${mid - h}px, ${peak - h}px) rotate(420deg) scale(1.25)`, opacity: 1, offset: 0.55 },
          { transform: `translate(${x1 - h}px, ${y1 - h}px) rotate(780deg) scale(.75)`, opacity: 1, offset: 0.95 },
          { transform: `translate(${x1 - h}px, ${y1 - h + 6}px) rotate(800deg) scale(.55)`, opacity: 0 },
        ],
        { duration: 640, delay: i * 85, easing: "cubic-bezier(.35,.1,.45,1)" },
      ),
      coin,
    );
    later(tl, i * 85 + 610, () => {
      animate(tl, n.box, [{ transform: "scale(1, 1)" }, { transform: "scale(1.035, .94)" }, { transform: "scale(1, 1)" }], { duration: 170, easing: "ease-out" });
      animate(tl, n.boxGlow, [{ opacity: 0.5 }, { opacity: 0 }], { duration: 260 });
      o.play("coin");
    });
  }
  await wait(tl, coins * 85 + 560);

  // La cloche : la corde balance, une onde dorée part du grelot
  animate(
    tl,
    n.rope,
    [{ rotate: "0deg" }, { rotate: "13deg", offset: 0.25 }, { rotate: "-9deg", offset: 0.5 }, { rotate: "5deg", offset: 0.75 }, { rotate: "0deg" }],
    { duration: 640, easing: "ease-in-out" },
  );
  ring(tl, n.fx, bell, 90, "rgb(242 216 138 / .9)", 80);
  o.play("bell", 20);
  await wait(tl, 380);

  // Deux claquements de mains (kashiwade) : deux ondes de choc et la scène qui tremble
  for (let k = 0; k < 2; k++) {
    ring(tl, n.fx, box, Math.min(W, H) * 0.62, "rgb(255 244 210 / .85)", 0, 800);
    shake(tl, n.world, 4);
    o.play("clap", 15);
    await wait(tl, 170);
  }

  // Colonne de lumière et rayons d'or
  animate(tl, n.boxGlow, [{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
  animate(tl, n.rope, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
  animate(tl, n.pillar, [{ transform: "scaleY(0)", opacity: 0 }, { transform: "scaleY(1)", opacity: 1 }], { duration: 420 });
  animate(tl, n.rays, [{ opacity: 0, scale: "0.6" }, { opacity: 0.8, scale: "1" }], { duration: 650 });
  o.play("whoosh");
  await wait(tl, 200);

  const center = { x: W / 2, y: H * 0.38 };
  fanOut(tl, n.fan, slot, center, "rise");
  const sw = n.fan[0]?.offsetWidth ?? 60;
  badgeIn(tl, n.badge, { x: center.x + sw * 1.6, y: center.y + sw * 0.5 });
  await wait(tl, 620);

  stampIn(tl, n.stamp, { x: center.x, y: center.y - 6 }, () => o.play("stamp", 40));
  await wait(tl, 300);
  flakes(tl, n.fx, center, o.lite ? 12 : 22, Math.min(W, H) * 0.42);
  animate(tl, n.box, [{ opacity: 1 }, { opacity: 0 }], { duration: 420 });
  animate(tl, n.pillar, [{ opacity: 1 }, { opacity: 0.25 }], { duration: 600 });
  resultIn(tl, n.result);
  o.onResult();
  later(tl, 120, () => o.play("chime"));
  await wait(tl, 420);
}
