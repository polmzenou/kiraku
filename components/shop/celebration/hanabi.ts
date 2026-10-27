import type { RunOptions, SceneNodes } from "./offering";
import { badgeIn, burst, centerIn, fanOut, flash, glitter, resultIn, ring, shake, span, stampIn, willow } from "./particles";
import { animate, later, removeWhenDone, wait, type Timeline } from "./timeline";

export type HanabiNodes = SceneNodes & {
  pack: HTMLElement;
  packGlow: HTMLElement;
  /** Couleur du type et sa version éclaircie, pour la pivoine. */
  colors: { base: string; light: string };
};

/**
 * 花火 Le feu d'artifice, grand final des gros achats (×10, Jūbako). Le pack frémit, file dans la nuit et
 * éclate en chrysanthème d'or puis en pivoine du type ; deux bouquets latéraux et un saule d'or suivent.
 * Les boosters naissent de l'explosion et redescendent comme des lanternes ; le sceau 済 s'abat.
 */
export async function runHanabi(tl: Timeline, n: HanabiNodes, o: RunOptions) {
  const W = n.world.clientWidth;
  const H = n.world.clientHeight;
  const R = Math.min(W, H);
  const top = { x: W / 2, y: H * 0.28 };
  const pack = centerIn(n.pack, n.world);
  const count = (full: number) => (o.lite ? Math.round(full / 2) : full);

  // Anticipation : le pack tremble au sol et s'illumine
  animate(tl, n.packGlow, [{ opacity: 0 }, { opacity: 1 }], { duration: 380 });
  animate(
    tl,
    n.pack,
    [
      { transform: "rotate(0deg)" },
      { transform: "rotate(-4deg)" },
      { transform: "rotate(4deg)" },
      { transform: "translateY(-5px) rotate(-3deg)" },
      { transform: "rotate(0deg)" },
    ],
    { duration: 400, easing: "ease-in-out" },
  );
  await wait(tl, 400);

  // Décollage : la fusée et sa traînée montent vers le ciel
  o.play("launch");
  animate(tl, n.pack, [{ transform: "translateY(0) scale(1)", opacity: 1 }, { transform: `translateY(${-H * 0.1}px) scale(.3)`, opacity: 0 }], {
    duration: 260,
    easing: "cubic-bezier(.5,0,.8,.6)",
  });
  animate(tl, n.packGlow, [{ opacity: 1 }, { opacity: 0 }], { duration: 500 });
  const shell = span(n.fx, "cel-shell");
  const trail = span(n.fx, "cel-trail");
  trail.style.height = `${Math.max(0, pack.y - top.y)}px`;
  removeWhenDone(
    animate(
      tl,
      shell,
      [
        { transform: `translate(${top.x - 4}px, ${pack.y}px)`, opacity: 1 },
        { transform: `translate(${top.x - 4}px, ${top.y}px)`, opacity: 1, offset: 0.97 },
        { transform: `translate(${top.x - 4}px, ${top.y}px)`, opacity: 0 },
      ],
      { duration: 560, easing: "cubic-bezier(.2,.6,.3,1)" },
    ),
    shell,
  );
  removeWhenDone(
    animate(
      tl,
      trail,
      [
        { transform: `translate(${top.x - 1}px, ${top.y}px) scaleY(0)`, opacity: 0.9 },
        { transform: `translate(${top.x - 1}px, ${top.y}px) scaleY(1)`, opacity: 0.9, offset: 0.8 },
        { transform: `translate(${top.x - 1}px, ${top.y}px) scaleY(1)`, opacity: 0 },
      ],
      { duration: 760, easing: "ease-out" },
    ),
    trail,
  );
  await wait(tl, 560);

  // Chrysanthème d'or (kiku), puis pivoine aux couleurs du type et crépitement
  flash(tl, n.fx, top, R * 0.7);
  burst(tl, n.fx, top, { count: count(46), radius: R * 0.38, colors: ["#fff6d8", "#f2d88a", "#d9b556"], streak: true });
  o.play("boom", [30, 40, 60]);
  shake(tl, n.world, 3);
  await wait(tl, 170);
  burst(tl, n.fx, top, { count: count(30), radius: R * 0.24, colors: [n.colors.light, "#fff3e0", n.colors.base], streak: false, duration: 1100 });
  glitter(tl, n.fx, top, count(24), R * 0.34);
  o.play("boom");
  later(tl, 650, () => o.play("crackle"));

  // Bouquets latéraux (ai et shu) et saule d'or
  later(tl, 260, () => {
    const at = { x: W * 0.24, y: H * 0.34 };
    flash(tl, n.fx, at, R * 0.45);
    burst(tl, n.fx, at, { count: count(30), radius: R * 0.26, colors: ["#cfe3ff", "#ffffff", "#7fa3d1"], streak: true });
    o.play("boom");
  });
  later(tl, 460, () => {
    const at = { x: W * 0.76, y: H * 0.32 };
    flash(tl, n.fx, at, R * 0.45);
    burst(tl, n.fx, at, { count: count(30), radius: R * 0.26, colors: ["#ffd5c9", "#ffffff", "#e0533f"], streak: true });
    o.play("boom");
  });
  later(tl, 700, () => {
    willow(tl, n.fx, top, count(28), R * 0.45);
    o.play("crackle");
  });
  await wait(tl, 360);

  // Les boosters naissent de l'explosion et descendent comme des lanternes
  const center = { x: W / 2, y: H * 0.44 };
  fanOut(tl, n.fan, top, center, "lantern");
  const sw = n.fan[0]?.offsetWidth ?? 60;
  badgeIn(tl, n.badge, { x: center.x + sw * 1.6, y: center.y + sw * 0.5 });
  await wait(tl, 980);

  stampIn(tl, n.stamp, { x: center.x, y: center.y - 6 }, () => o.play("stamp", 40));
  await wait(tl, 300);
  ring(tl, n.fx, center, R * 0.5, "rgb(255 236 190 / .8)");
  glitter(tl, n.fx, { x: center.x, y: center.y - R * 0.05 }, count(14), R * 0.3, 0);
  resultIn(tl, n.result);
  o.onResult();
  later(tl, 120, () => o.play("chime"));
  await wait(tl, 420);
}
