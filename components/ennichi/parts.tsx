import type { CSSProperties, ReactNode } from "react";
import { REFERRAL_IMAGES, type ReferralImage } from "@/lib/referral/assets";

// Briques visuelles de l'Ennichi (maquettes validées, module 3 du prototype) : lanterne chōchin (PV2-LANTERNE), rue des
// lanternes (PV2-ENNICHI-RUE, une lanterne à chaque crochet de l'image), fonds selon le thème et l'appareil, corde du
// Yokozuna. Pas de hook : utilisables côté serveur comme côté client. Styles : components/ennichi/ennichi.css (.enn).

const img = (key: string): ReferralImage | null => (REFERRAL_IMAGES as Record<string, ReferralImage>)[key] ?? null;
const url = (key: string) => {
  const i = img(key);
  return i ? `url("${i.src}")` : "none";
};

/** Lanterne allumée ou éteinte, avec le kanji de son palier au centre du papier. Décorative. */
export function Lantern({ kanji = "", on, width = 40, className = "", style }: { kanji?: string; on: boolean; width?: number; className?: string; style?: CSSProperties }) {
  return (
    <span aria-hidden="true" className={`lt ${on ? "flicker" : "off"} ${className}`} style={{ ["--w" as string]: `${width}px`, ...style }}>
      <span className="lt-body" />
      {kanji && (
        <span lang="ja" className="lt-k">
          {kanji}
        </span>
      )}
    </span>
  );
}

/**
 * Crochets des deux guirlandes de PV2-ENNICHI-RUE, en pixels de l'image (mêmes places en Yoru et en Washi) ; lw : largeur
 * d'une lanterne en % de la largeur de l'image. Relevés sur les images validées (prototype).
 */
const RUE = {
  telephone: {
    w: 1080,
    h: 720,
    lw: 7,
    pts: [[129, 165], [209, 192], [327, 222], [454, 240], [601, 252], [718, 250], [827, 237], [945, 212], [140, 332], [229, 354], [336, 373], [446, 383], [560, 387], [683, 382], [802, 369], [898, 351]],
  },
  ordinateur: {
    w: 2400,
    h: 700,
    lw: 3.8,
    pts: [
      [218, 174], [376, 211], [543, 244], [707, 266], [863, 284], [1014, 292], [1169, 293], [1344, 287], [1505, 278], [1681, 255], [1832, 231], [1995, 199], [2174, 159],
      [407, 378], [538, 396], [669, 411], [794, 424], [916, 431], [1041, 435], [1161, 436], [1291, 433], [1425, 428], [1559, 417], [1690, 404], [1833, 386], [1981, 364], [2186, 321],
    ],
  },
} as const;

/** Nombre de crochets de la rue sur cet appareil (lanternes dessinées). */
export const streetHooks = { telephone: RUE.telephone.pts.length, ordinateur: RUE.ordinateur.pts.length };

function RueBoard({ device, lit }: { device: "telephone" | "ordinateur"; lit: number }) {
  const r = RUE[device];
  const pts = [...r.pts].sort((a, b) => a[0] - b[0]);
  return (
    <div
      aria-hidden="true"
      className={`rue-board ${device === "telephone" ? "is-phone" : "is-desk"}`}
      style={{ ["--img" as string]: url(`ennichi-rue/yoru/${device}`), ["--img-w" as string]: url(`ennichi-rue/washi/${device}`) }}
    >
      {pts.map(([x, y], i) => (
        <span key={`${x}-${y}`} className="street-l" style={{ left: `${((x / r.w) * 100).toFixed(2)}%`, top: `${((y / r.h) * 100).toFixed(2)}%`, width: `${r.lw}%` }}>
          <Lantern kanji={i < lit ? "祭" : ""} on={i < lit} width={22} />
        </span>
      ))}
    </div>
  );
}

/**
 * Rue des lanternes : l'image du thème et de l'appareil, une lanterne par crochet, allumées de gauche à droite en
 * proportion des lanternes allumées (`litPhone` / `litDesk`, calculés pour chaque cadrage). `children` : ce qui est posé
 * sur le bas voilé (compte, titre).
 */
export function Street({ litPhone, litDesk, hero = false, className = "", children }: { litPhone: number; litDesk: number; hero?: boolean; className?: string; children?: ReactNode }) {
  return (
    <div className={`street ${hero ? "ehero" : ""} ${className}`}>
      <RueBoard device="telephone" lit={litPhone} />
      <RueBoard device="ordinateur" lit={litDesk} />
      {children}
    </div>
  );
}

/** Variables d'un fond selon le thème et l'appareil (classe .themed-bg) : sanctuaire, rue… */
export function themedBg(base: string): CSSProperties {
  return {
    ["--bg-yt" as string]: url(`${base}/yoru/telephone`),
    ["--bg-yd" as string]: url(`${base}/yoru/ordinateur`),
    ["--bg-wt" as string]: url(`${base}/washi/telephone`),
    ["--bg-wd" as string]: url(`${base}/washi/ordinateur`),
  };
}

/** Image d'une seule version en fond (papier du banzuke, nobori, corde…). */
export function bgOf(key: string, size: "cover" | "contain" | "100% 100%" = "contain", position = "50% 50%"): CSSProperties {
  return { backgroundImage: url(key), backgroundSize: size, backgroundPosition: position, backgroundRepeat: "no-repeat" };
}

/** Corde tressée du Yokozuna (PV2-TSUNA), shide comprises. */
export function Tsuna({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`m3-tsuna ${className}`} style={bgOf("tsuna")} />;
}

/** Feux d'artifice (PV2-HANABI) : trois gerbes de l'image qui éclosent tour à tour. */
export function Hanabi() {
  return (
    <div aria-hidden="true" className="m3-hanabi-slot" style={{ ["--img" as string]: url("hanabi") }}>
      <i className="hb hb1" />
      <i className="hb hb2" />
      <i className="hb hb3" />
    </div>
  );
}

/** Dohyō (PV2-DOHYO) : l'image du cadrage, posée au bas de la scène. */
export function DohyoRing() {
  return <div aria-hidden="true" className="m3-ring" style={{ ["--ring-t" as string]: url("dohyo/telephone"), ["--ring-d" as string]: url("dohyo/ordinateur") }} />;
}

/** Sceau carré vermillon d'un écran (« 祭 », « 番 »…). */
export function Seal({ kanji, size = 34, className = "" }: { kanji: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      lang="ja"
      className={`flex shrink-0 items-center justify-center rounded-sm bg-shu-btn font-seal text-washi-paper ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
    >
      {kanji}
    </span>
  );
}
