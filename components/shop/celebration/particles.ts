import { animate, later, removeWhenDone, SPRING, type Timeline } from "./timeline";

// Effets partagés des célébrations : ondes, paillettes d'or, étincelles, éventail des sachets, sceau et
// résumé. Positions calculées (jamais de hasard au rendu) ; les particules sont de simples <span>
// stylés par celebration.css, posés dans le calque d'effets puis retirés.

export type Point = { x: number; y: number };

export function span(layer: HTMLElement, className: string): HTMLSpanElement {
  const s = document.createElement("span");
  s.className = className;
  layer.appendChild(s);
  return s;
}

/** Position d'un nœud dans le repère de la scène (son centre). */
export function centerIn(node: Element, world: Element): Point {
  const r = node.getBoundingClientRect();
  const w = world.getBoundingClientRect();
  return { x: r.left - w.left + r.width / 2, y: r.top - w.top + r.height / 2 };
}

export function ring(tl: Timeline, layer: HTMLElement, at: Point, size: number, color: string, delay = 0, duration = 900) {
  const r = span(layer, "cel-ring");
  r.style.width = r.style.height = `${size}px`;
  r.style.borderColor = color;
  const p = `translate(${at.x - size / 2}px, ${at.y - size / 2}px)`;
  removeWhenDone(
    animate(tl, r, [{ transform: `${p} scale(.2)`, opacity: 0.95 }, { transform: `${p} scale(1.7)`, opacity: 0 }], {
      duration,
      delay,
      easing: "cubic-bezier(.2,.7,.3,1)",
    }),
    r,
  );
}

export function flash(tl: Timeline, layer: HTMLElement, at: Point, size: number) {
  const f = span(layer, "cel-flash");
  f.style.width = f.style.height = `${size}px`;
  const p = `translate(${at.x - size / 2}px, ${at.y - size / 2}px)`;
  removeWhenDone(animate(tl, f, [{ transform: `${p} scale(.2)`, opacity: 1 }, { transform: `${p} scale(1.3)`, opacity: 0 }], { duration: 520, easing: "ease-out" }), f);
}

/** Feuilles d'or en couronne qui retombent. */
export function flakes(tl: Timeline, layer: HTMLElement, at: Point, count: number, radius: number, colors?: readonly string[]) {
  for (let i = 0; i < count; i++) {
    const f = span(layer, "cel-flake");
    if (colors) f.style.background = colors[i % colors.length];
    const a = (i / count) * Math.PI * 2 + 0.4;
    const r = radius * (0.6 + ((i * 37) % 40) / 100);
    const dx = Math.cos(a) * r;
    const dy = Math.sin(a) * r * 0.8 - radius * 0.15;
    removeWhenDone(
      animate(
        tl,
        f,
        [
          { transform: `translate(${at.x}px, ${at.y}px) rotate(0deg) scale(.6)`, opacity: 1 },
          { transform: `translate(${at.x + dx}px, ${at.y + dy}px) rotate(${200 + i * 40}deg) scale(1)`, opacity: 1, offset: 0.6 },
          { transform: `translate(${at.x + dx * 1.08}px, ${at.y + dy + radius * 0.55}px) rotate(${330 + i * 40}deg) scale(.8)`, opacity: 0 },
        ],
        { duration: 1300 + (i % 4) * 140, easing: "cubic-bezier(.15,.6,.35,1)" },
      ),
      f,
    );
  }
}

/** Bouquet de feu d'artifice : étincelles en sphère, freinées puis tombées. */
export function burst(
  tl: Timeline,
  layer: HTMLElement,
  at: Point,
  { count, radius, colors, streak, duration = 1200 }: { count: number; radius: number; colors: readonly string[]; streak: boolean; duration?: number },
) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (i % 2) * 0.06;
    const r = radius * (0.8 + ((i * 53) % 20) / 100);
    const dx = Math.cos(a) * r;
    const dy = Math.sin(a) * r;
    const color = colors[i % colors.length];
    const p = span(layer, streak ? "cel-spark cel-streak" : "cel-spark");
    p.style.color = color;
    p.style.background = streak ? `linear-gradient(180deg, ${color}, transparent)` : color;
    const deg = (a * 180) / Math.PI + 90;
    removeWhenDone(
      animate(
        tl,
        p,
        [
          { transform: `translate(${at.x}px, ${at.y}px) rotate(${deg}deg) scale(.2)`, opacity: 1 },
          { transform: `translate(${at.x + dx * 0.86}px, ${at.y + dy * 0.86}px) rotate(${deg}deg) scale(1)`, opacity: 1, offset: 0.45 },
          { transform: `translate(${at.x + dx}px, ${at.y + dy + radius * 0.4}px) rotate(${deg}deg) scale(.45)`, opacity: 0 },
        ],
        { duration: duration + (i % 5) * 60, easing: "cubic-bezier(.12,.7,.3,1)" },
      ),
      p,
    );
  }
}

/** Crépitement : points qui clignotent dans la sphère du bouquet. */
export function glitter(tl: Timeline, layer: HTMLElement, at: Point, count: number, radius: number, delay = 520) {
  for (let i = 0; i < count; i++) {
    const d = span(layer, "cel-dot");
    const a = (i / count) * Math.PI * 2 + 0.8;
    const r = radius * (0.5 + ((i * 29) % 50) / 100);
    const x = at.x + Math.cos(a) * r;
    const y = at.y + Math.sin(a) * r + radius * 0.25;
    removeWhenDone(
      animate(
        tl,
        d,
        [
          { transform: `translate(${x}px, ${y}px)`, opacity: 0 },
          { opacity: 1, offset: 0.2 },
          { opacity: 0.1, offset: 0.4 },
          { opacity: 1, offset: 0.6 },
          { opacity: 0.2, offset: 0.8 },
          { transform: `translate(${x}px, ${y + 14}px)`, opacity: 0 },
        ],
        { duration: 900, delay: delay + (i % 6) * 40, easing: "linear" },
      ),
      d,
    );
  }
}

/** Saule (shidare yanagi) : longues traînées d'or qui retombent lentement. */
export function willow(tl: Timeline, layer: HTMLElement, at: Point, count: number, radius: number) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const dx = Math.cos(a) * radius * 0.7;
    const dy = Math.sin(a) * radius * 0.35;
    const p = span(layer, "cel-spark cel-streak");
    p.style.color = "#f2d88a";
    p.style.background = "linear-gradient(180deg, #fff1c4, transparent)";
    removeWhenDone(
      animate(
        tl,
        p,
        [
          { transform: `translate(${at.x}px, ${at.y}px) scale(.3)`, opacity: 1 },
          { transform: `translate(${at.x + dx}px, ${at.y + dy}px) scale(1)`, opacity: 1, offset: 0.3 },
          { transform: `translate(${at.x + dx * 1.1}px, ${at.y + dy + radius * 1.1}px) scale(1, 1.6)`, opacity: 0 },
        ],
        { duration: 1900, easing: "cubic-bezier(.2,.5,.4,1)" },
      ),
      p,
    );
  }
}

/** Secousse brève de la scène (claquement de mains, explosion). */
export function shake(tl: Timeline, node: HTMLElement, power = 3) {
  animate(
    tl,
    node,
    [
      { transform: "translate(0, 0)" },
      { transform: `translate(${power}px, ${-power}px)` },
      { transform: `translate(${-power}px, ${power * 0.6}px)` },
      { transform: `translate(${power * 0.6}px, ${power}px)` },
      { transform: "translate(0, 0)" },
    ],
    { duration: 260, easing: "linear" },
  );
}

/** Place d'un sachet dans l'éventail, en largeurs et hauteurs de sachet. */
export function fanSlot(i: number, n: number) {
  const k = i - (n - 1) / 2;
  return { k, rotate: k * 13, x: k * 0.62, y: Math.abs(k) * 0.07 };
}

/**
 * Les sachets (déjà rendus, invisibles) partent d'un point vers leur place dans l'éventail : en jaillissant
 * avec un rebond, ou en descendant comme des lanternes.
 */
export function fanOut(tl: Timeline, fan: readonly HTMLElement[], from: Point, center: Point, mode: "rise" | "lantern") {
  fan.forEach((node, i) => {
    const sw = node.offsetWidth;
    const sh = node.offsetHeight;
    const slot = fanSlot(i, fan.length);
    node.style.zIndex = String(10 + fan.length - Math.abs(Math.round(slot.k)));
    const x0 = from.x - sw / 2;
    const y0 = from.y - sh / 2;
    const x1 = center.x - sw / 2 + slot.x * sw;
    const y1 = center.y - sh / 2 + slot.y * sh;
    const frames: Keyframe[] =
      mode === "lantern"
        ? [
            { transform: `translate(${x0}px, ${y0}px) rotate(0deg) scale(0)`, opacity: 0 },
            { transform: `translate(${x1}px, ${y1 - sh * 0.35}px) rotate(${slot.rotate + 6}deg) scale(1.05)`, opacity: 1, offset: 0.42 },
            { transform: `translate(${x1}px, ${y1 + sh * 0.06}px) rotate(${slot.rotate - 3}deg) scale(1)`, opacity: 1, offset: 0.72 },
            { transform: `translate(${x1}px, ${y1}px) rotate(${slot.rotate}deg) scale(1)`, opacity: 1 },
          ]
        : [
            { transform: `translate(${x0}px, ${y0}px) rotate(0deg) scale(.35)`, opacity: 0 },
            { transform: `translate(${x0}px, ${y0 - sh * 0.5}px) rotate(0deg) scale(.75)`, opacity: 1, offset: 0.32 },
            { transform: `translate(${x1}px, ${y1}px) rotate(${slot.rotate}deg) scale(1)`, opacity: 1 },
          ];
    animate(tl, node, frames, {
      duration: mode === "lantern" ? 1000 : 680,
      delay: i * (mode === "lantern" ? 90 : 70),
      easing: mode === "lantern" ? "cubic-bezier(.25,.6,.3,1)" : SPRING,
    });
  });
}

/** Badge « ×10 » à droite de l'éventail quand il y a plus de sachets que dessinés. */
export function badgeIn(tl: Timeline, badge: HTMLElement | null, at: Point) {
  if (!badge) return;
  const p = `translate(${at.x}px, ${at.y}px)`;
  animate(tl, badge, [{ transform: `${p} scale(0)`, opacity: 0 }, { transform: `${p} scale(1)`, opacity: 1 }], { duration: 360, delay: 520, easing: SPRING });
}

/** Le sceau 済 s'abat : il tombe de haut, s'écrase un peu et se pose de biais. */
export function stampIn(tl: Timeline, stamp: HTMLElement, at: Point, play: () => void) {
  const size = stamp.offsetWidth;
  const p = `translate(${at.x - size / 2}px, ${at.y - size / 2}px)`;
  animate(
    tl,
    stamp,
    [
      { transform: `${p} scale(2.4) rotate(-32deg)`, opacity: 0, easing: "cubic-bezier(.55,0,.85,.4)" },
      { transform: `${p} scale(.9) rotate(-11deg)`, opacity: 1, offset: 0.72, easing: "cubic-bezier(.2,.8,.3,1)" },
      { transform: `${p} scale(1) rotate(-12deg)`, opacity: 1 },
    ],
    { duration: 420 },
  );
  later(tl, 300, play);
}

/** Le résumé de l'achat monte en place. */
export function resultIn(tl: Timeline, result: HTMLElement) {
  animate(tl, result, [{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 420 });
}
