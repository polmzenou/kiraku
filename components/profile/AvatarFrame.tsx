import Image from "next/image";
import type { ReactNode } from "react";
import { FRAME_IMAGE_MIN_SIZE, FRAME_KANJI, FRAME_RING, type FrameStyle } from "@/lib/profile/frames";
import { REFERRAL_IMAGES } from "@/lib/referral/assets";
import { plateMaterial, toRoman } from "@/lib/prestige/roman";

/**
 * Plaque du prestige : le chiffre romain sur un hexagone d'écaille de tortue (kikkō), posé en haut du cadre, en
 * miroir du sceau du bas. Plaque complète à partir de 40 px, réduite de 24 à 39 px, masquée en dessous. Sa matière
 * change avec le niveau (laque, or, émeraude, nacre).
 */
function PrestigePlate({ prestige, size }: { prestige: number; size: number }) {
  if (prestige < 1 || size < 24) return null;
  const label = toRoman(prestige);
  const small = size < 40;
  // Les longs chiffres (XXXVIII) se resserrent pour rester dans la largeur de l'avatar
  const squeeze = label.length >= 7 ? 0.7 : label.length >= 5 ? 0.84 : 1;
  const height = small ? 11 : Math.max(13, Math.round(size * 0.3));
  const font = (small ? 8.5 : Math.max(9, size * 0.2)) * squeeze;
  return (
    <span
      aria-hidden="true"
      className={`prestige-plate font-title${small ? " is-small" : ""}`}
      data-mat={plateMaterial(prestige)}
      style={{ height, fontSize: font, top: -height / 2 + 2 }}
    >
      <span>{label}</span>
    </span>
  );
}

/**
 * Cadre d'avatar : un anneau dans la matière du style, son sceau en bas, et la plaque du prestige en haut.
 * Sans style ni prestige, l'avatar est rendu tel quel.
 */
export function AvatarFrame({ frame, size, prestige = 0, children }: { frame: FrameStyle | null; size: number; prestige?: number; children: ReactNode }) {
  if (!frame) {
    if (prestige < 1 || size < 24) return <>{children}</>;
    return (
      <span className="relative inline-flex shrink-0">
        {children}
        <PrestigePlate prestige={prestige} size={size} />
      </span>
    );
  }
  const ring = Math.max(3, Math.round(size / 16));
  if (frame === "fil" && size >= FRAME_IMAGE_MIN_SIZE) {
    // Fil rouge (PV2-CADRE-FIL) : le cordon de soie enroulé deux fois et son nœud awaji, en image autour de l'avatar ;
    // même encombrement que les autres cadres, le cordon déborde un peu (l'avatar en occupe 84 %)
    const box = Math.round(size / 0.84);
    const offset = ring + 1 + size / 2 - box / 2;
    return (
      <span className="relative inline-flex shrink-0" style={{ padding: ring }}>
        <span className="inline-flex overflow-hidden rounded-full bg-bg p-px [&>*]:rounded-full">{children}</span>
        <Image
          src={REFERRAL_IMAGES["cadre-fil"].src}
          alt=""
          width={box}
          height={box}
          aria-hidden="true"
          className="pointer-events-none absolute max-w-none select-none drop-shadow-[0_2px_3px_rgb(0_0_0/0.35)]"
          style={{ left: offset, top: offset, width: box, height: box }}
        />
        <PrestigePlate prestige={prestige} size={size} />
      </span>
    );
  }
  return (
    <span className="relative inline-flex shrink-0">
      <span className={`inline-flex rounded-full shadow-raised ${FRAME_RING[frame]}`} style={{ padding: ring }}>
        <span className="inline-flex overflow-hidden rounded-full bg-bg p-px [&>*]:rounded-full">{children}</span>
      </span>
      {size >= 48 && (
        <span
          aria-hidden="true"
          lang="ja"
          className="absolute -bottom-1 left-1/2 flex size-5 -translate-x-1/2 items-center justify-center rounded-[4px] border border-border bg-surface font-seal text-[11px] text-shu"
        >
          {FRAME_KANJI[frame]}
        </span>
      )}
      <PrestigePlate prestige={prestige} size={size} />
    </span>
  );
}
