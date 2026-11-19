// Carte spectrale (rareté Esprit) : l'illustration est peinte en WebGL2, déformée par une turbulence de bruit,
// et ses bords se dissolvent comme un fantôme. Inspirée de la Decay Card de React Bits, réécrite pour Kiraku :
// bruit de valeur maison, voile du nom et teinte froide dans le shader, apparition (`presence`) pour la révélation.
// Ce module reste pur (aucun accès au DOM) : sources GLSL et calculs testables sous Vitest.

/** Marge autour de la carte dans le canvas (part de la largeur) : place laissée aux bords qui se déforment. */
export const SPECTRAL_MARGIN = 0.06;
/** Durée de l'apparition à la révélation (ms). */
export const MATERIALIZE_MS = 1600;
/** Teinte froide par défaut (cyan spectral, couleur de la rareté). */
export const SPECTRAL_TINT = "#9fe3ec";

export const SPECTRAL_VERTEX = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

export const SPECTRAL_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform vec2 uImg;
uniform vec2 uFocal;
uniform float uZoom;
uniform float uTime;
uniform float uLevel;
uniform float uStrength;
uniform float uFreq;
uniform float uIdle;
uniform float uPresence;
uniform float uSeed;
uniform vec3 uTint;
uniform float uVeil;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
// Bruit centré (déplacement) et turbulence en crêtes (bords rongés, volutes de l'apparition)
float fbm(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * (noise(p) * 2.0 - 1.0); p = p * 2.02 + vec3(19.1, 7.3, 3.7); a *= 0.5; }
  return s;
}
float turb(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * abs(noise(p) * 2.0 - 1.0); p = p * 2.03 + vec3(5.9, 13.7, 2.1); a *= 0.5; }
  return s;
}

void main() {
  float W = uRes.x;
  float unit = W / 500.0;
  // Origine en haut à gauche, y vers le bas (comme l'image et le CSS)
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  vec2 center = uRes * 0.5;
  vec2 halfBox = center - vec2(${SPECTRAL_MARGIN.toFixed(3)} * W);
  vec2 q = px / unit;
  float t = uTime;

  // Bord de la carte : la déformation et le souffle s'y concentrent
  vec2 dEdge = halfBox - abs(px - center);
  float rim = 1.0 - smoothstep(0.0, 0.32 * W, min(dEdge.x, dEdge.y));
  float drift = noise(vec3(q * 0.006 + uSeed * 0.37, t * 0.12));
  float breathe = uIdle * mix(0.12, 1.0, rim) * smoothstep(0.25, 0.85, drift);
  float appear = 1.0 - uPresence;
  float amount = uLevel * uStrength * mix(0.3, 1.0, rim) + breathe * 0.45 + appear * appear * 1.4;
  vec3 np = vec3(q * uFreq + uSeed * vec2(17.31, 9.17), t * (0.05 + uIdle * 0.18) + uSeed * 3.1);
  vec2 offs = vec2(fbm(np), fbm(np + vec3(31.7, 47.3, 5.3))) * amount * 150.0 * unit;
  vec2 src = px + offs;

  // Silhouette : boîte arrondie dont le bord est rongé par la turbulence
  float r = 0.045 * W;
  vec2 b = abs(src - center) - (halfBox - r);
  float sd = length(max(b, 0.0)) + min(max(b.x, b.y), 0.0) - r;
  float erosion = turb(vec3(q * uFreq * 2.2 + 7.1, t * 0.04 + uSeed)) * (0.05 + 0.06 * uIdle + 0.08 * appear) * W;
  float alpha = smoothstep(0.0, 0.035 * W, -sd - erosion);

  // Apparition : la carte se forme depuis des volutes quand la présence monte
  float wisps = turb(vec3(q * 0.0045 + 3.3, t * 0.35));
  alpha *= smoothstep(wisps - 0.1, wisps + 0.1, uPresence * 1.3 - 0.15);

  // Cadrage « cover » avec point focal et zoom, comme object-position / transform de l'image
  vec2 boxUv = (src - (center - halfBox)) / (2.0 * halfBox);
  boxUv = uFocal + (boxUv - uFocal) / uZoom;
  float boxAspect = halfBox.x / halfBox.y;
  float imgAspect = uImg.x / uImg.y;
  vec2 f = imgAspect > boxAspect ? vec2(boxAspect / imgAspect, 1.0) : vec2(1.0, imgAspect / boxAspect);
  vec2 uv = (1.0 - f) * uFocal + boxUv * f;
  vec2 split = offs / uRes * 0.06 + vec2(0.004 * min(amount, 1.5), 0.0);
  vec3 col = vec3(texture(uTex, uv + split).r, texture(uTex, uv).g, texture(uTex, uv - split).b);

  // Teinte froide, lueur sur les bords, voile sous le nom
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, vec3(lum) * (uTint * 0.55 + 0.6), 0.32);
  col += uTint * (rim * 0.22 + appear * 0.5) * (0.4 + lum);
  float veilY = (px.y - (center.y - halfBox.y)) / (2.0 * halfBox.y);
  col = mix(col, vec3(0.025, 0.04, 0.075), smoothstep(0.56, 0.94, veilY) * uVeil * 0.82);
  outColor = vec4(col * alpha, alpha);
}`;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Grain du brouillard (0 = larges volutes, 1 = fin) → fréquence du bruit par unité (500 unités = largeur de la carte). */
export function grainToFrequency(grain: number): number {
  return 0.003 + clamp(grain, 0, 1) * 0.03;
}

/** Vitesse du pointeur (px/s) → niveau de déformation voulu (0..1), en courbe douce. */
export function speedToLevel(speed: number): number {
  if (!(speed > 0)) return 0;
  return Math.min(1, speed / 1400) ** 1.6;
}

/** Rapproche `current` de `target` : vite à la montée (80 ms), lentement à la retombée (600 ms). */
export function approach(current: number, target: number, dt: number, rise = 0.08, fall = 0.6): number {
  const tau = target > current ? rise : fall;
  return current + (target - current) * (1 - Math.exp(-Math.max(0, dt) / tau));
}

/** Présence de la carte pendant l'apparition (progression 0..1) : montée qui ralentit à la fin. */
export function presenceAt(progress: number): number {
  if (!(progress > 0)) return 0;
  if (progress >= 1) return 1;
  return 1 - (1 - progress) ** 3;
}

/** Part de l'image visible en « cover » dans une boîte (même calcul que le shader). */
export function coverFraction(imgW: number, imgH: number, boxW: number, boxH: number): [number, number] {
  const box = boxW / boxH, img = imgW / imgH;
  return img > box ? [box / img, 1] : [1, img / box];
}

/** Couleur #rrggbb → composantes 0..1 (repli sur la teinte par défaut). */
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex) ?? /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(SPECTRAL_TINT)!;
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}

/**
 * Adresse de la texture. Le CDN d'AniList ne répond `Vary: Origin` qu'aux requêtes CORS : l'image déjà chargée par
 * <img> (sans CORS) resterait en cache et ferait échouer la texture. Une adresse à part (paramètre ignoré par le
 * CDN) force une requête CORS ; une image du site (chemin relatif) n'en a pas besoin.
 */
export function textureUrl(src: string): string {
  if (!/^https?:\/\//i.test(src)) return src;
  return `${src}${src.includes("?") ? "&" : "?"}kn-gl=1`;
}

/** Graine stable par personnage (pas de hasard au rendu) : chaque carte a ses propres volutes. */
export function spectralSeed(name: string): number {
  let h = 2166136261;
  for (const c of name) h = Math.imul(h ^ (c.codePointAt(0) ?? 0), 16777619);
  return ((h >>> 0) % 1000) / 100;
}
