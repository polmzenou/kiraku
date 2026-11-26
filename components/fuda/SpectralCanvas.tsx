"use client";

import { useEffect, useRef } from "react";
import {
  approach, grainToFrequency, hexToRgb, MATERIALIZE_MS, presenceAt, SPECTRAL_FRAGMENT, SPECTRAL_VERTEX, speedToLevel, textureUrl,
} from "@/lib/fx/spectral";

// Canvas WebGL2 de la carte spectrale (rareté Esprit), chargé à part (next/dynamic) : seules les grandes cartes
// vivantes le montent. Une seule boucle requestAnimationFrame par carte, arrêtée hors de l'écran ou onglet caché.

/** Vitesse du pointeur, partagée par toutes les cartes : un seul écouteur sur la fenêtre. */
const pointer = { speed: 0, x: 0, y: 0, at: 0, listeners: 0 };
const onPointerMove = (e: PointerEvent) => {
  const now = performance.now();
  const dt = Math.max(1, now - pointer.at) / 1000;
  if (pointer.at) pointer.speed = Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) / dt;
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.at = now;
};
function listenPointer() {
  if (pointer.listeners++ === 0) window.addEventListener("pointermove", onPointerMove, { passive: true });
  return () => {
    if (--pointer.listeners === 0) window.removeEventListener("pointermove", onPointerMove);
  };
}
/** La vitesse retombe d'elle-même quand le pointeur s'arrête (pas d'évènement « immobile »). */
function currentSpeed(now: number) {
  const idle = now - pointer.at;
  return idle > 120 ? 0 : pointer.speed;
}

export type SpectralCanvasProps = {
  src: string;
  focalX: number;
  focalY: number;
  zoom: number;
  strength: number;
  grain: number;
  idle: number;
  seed: number;
  tint?: string;
  /** Voile sombre sous le nom (pleine carte). */
  veil?: boolean;
  /**
   * Révélation : « hidden » tient la carte invisible, « now » joue l'apparition à partir de la première image
   * qui le voit ; absent, la carte est là.
   */
  appear?: "hidden" | "now";
  /** Mouvement coupé : une image par changement, sans boucle ni apparition animée. */
  still?: boolean;
  onReady: () => void;
  onFail: () => void;
};

export default function SpectralCanvas(props: SpectralCanvasProps) {
  const ref = useRef<HTMLSpanElement>(null);
  // Réglages lus à chaque image : un curseur de l'admin agit sans recréer le contexte
  const live = useRef(props);
  const wakeRef = useRef<() => void>(() => {});
  useEffect(() => {
    live.current = props;
    wakeRef.current();
  });

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    // Un canvas neuf à chaque montage : le contexte rendu au démontage (loseContext) ne se réutilise pas, et
    // React peut remonter l'effet sur le même élément (mode strict, changement d'image)
    const canvas = document.createElement("canvas");
    host.appendChild(canvas);
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl) {
      canvas.remove();
      return void live.current.onFail();
    }

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
    };
    const vs = compile(gl.VERTEX_SHADER, SPECTRAL_VERTEX);
    const fs = compile(gl.FRAGMENT_SHADER, SPECTRAL_FRAGMENT);
    const program = gl.createProgram();
    if (!vs || !fs || !program) return void live.current.onFail();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return void live.current.onFail();
    gl.useProgram(program);

    // Un triangle qui couvre tout le canvas
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    const u = (name: string) => gl.getUniformLocation(program, name);
    const uni = {
      res: u("uRes"), img: u("uImg"), focal: u("uFocal"), zoom: u("uZoom"), time: u("uTime"), level: u("uLevel"),
      strength: u("uStrength"), freq: u("uFreq"), idle: u("uIdle"), presence: u("uPresence"), seed: u("uSeed"),
      tint: u("uTint"), veil: u("uVeil"),
    };
    gl.uniform1i(u("uTex"), 0);
    gl.clearColor(0, 0, 0, 0);

    let disposed = false;
    let texture: WebGLTexture | null = null;
    let imgSize = [1, 1];
    let frame = 0;
    let visible = false;
    let last = 0;
    let level = 0;
    let readySent = false;
    const born = performance.now();
    let appearAt: number | null = null;
    // Écran tactile lu une fois au montage, et taille relue seulement quand le ResizeObserver la signale : lire
    // clientWidth à chaque image forçait un recalcul du style et de la mise en page (FudaTilt vient d'écrire --mx)
    const coarse = matchMedia("(pointer: coarse)").matches;
    let sized = false;
    // Teinte convertie seulement quand elle change, pas à chaque image
    let tintHex: string | null = null;
    let tint: [number, number, number] = [0, 0, 0];

    const resize = () => {
      sized = true;
      const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    const draw = (now: number) => {
      const p = live.current;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      level = approach(level, p.still ? 0 : speedToLevel(currentSpeed(now)), dt);
      if (p.appear === "now" && appearAt === null) appearAt = now;
      const presence = p.appear === undefined ? 1 : appearAt === null ? 0 : presenceAt((now - appearAt) / MATERIALIZE_MS);
      if (!sized) resize();
      const hex = p.tint ?? "#9fe3ec";
      if (hex !== tintHex) {
        tintHex = hex;
        tint = hexToRgb(hex);
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uni.res, canvas.width, canvas.height);
      gl.uniform2f(uni.img, imgSize[0], imgSize[1]);
      gl.uniform2f(uni.focal, p.focalX / 100, p.focalY / 100);
      gl.uniform1f(uni.zoom, p.zoom);
      gl.uniform1f(uni.time, p.still ? 0 : (now - born) / 1000);
      gl.uniform1f(uni.level, level);
      gl.uniform1f(uni.strength, p.strength);
      gl.uniform1f(uni.freq, grainToFrequency(p.grain));
      gl.uniform1f(uni.idle, p.idle);
      gl.uniform1f(uni.presence, p.still && p.appear !== "hidden" ? 1 : presence);
      gl.uniform1f(uni.seed, p.seed);
      gl.uniform3f(uni.tint, ...tint);
      gl.uniform1f(uni.veil, p.veil === false ? 0 : 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!readySent) {
        readySent = true;
        p.onReady();
      }
    };

    const loop = (now: number) => {
      frame = 0;
      if (disposed || !texture) return;
      draw(now);
      if (!live.current.still && visible && !document.hidden) frame = requestAnimationFrame(loop);
    };
    const wake = () => {
      if (!frame && texture && visible && !document.hidden) frame = requestAnimationFrame(loop);
    };

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      if (disposed) return;
      texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      } catch {
        // Image sans en-tête CORS : la carte garde son repli CSS
        return live.current.onFail();
      }
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      imgSize = [image.naturalWidth || 1, image.naturalHeight || 1];
      // Mouvement coupé : une image fixe, même hors de l'écran
      if (live.current.still) draw(performance.now());
      else wake();
    };
    image.onerror = () => {
      if (!disposed) live.current.onFail();
    };
    image.src = textureUrl(live.current.src);

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      wake();
    });
    observer.observe(canvas);
    const resizer = new ResizeObserver(() => {
      // Nouvelle taille relue à la prochaine image (carte vivante) ou tout de suite (carte figée)
      sized = false;
      if (live.current.still && texture) draw(performance.now());
    });
    // Changement de réglage ou d'apparition sur une carte figée : une image de plus
    wakeRef.current = () => {
      if (live.current.still && texture) draw(performance.now());
    };
    resizer.observe(canvas);
    document.addEventListener("visibilitychange", wake);
    const unlisten = listenPointer();
    const onLost = (e: Event) => {
      e.preventDefault();
      live.current.onFail();
    };
    canvas.addEventListener("webglcontextlost", onLost);

    return () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      resizer.disconnect();
      document.removeEventListener("visibilitychange", wake);
      canvas.removeEventListener("webglcontextlost", onLost);
      unlisten();
      image.onload = null;
      image.onerror = null;
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      // Rend le contexte tout de suite : le navigateur n'en garde qu'une quinzaine
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    };
  }, [props.src]);

  return <span ref={ref} aria-hidden="true" className="kn-spectral" />;
}
