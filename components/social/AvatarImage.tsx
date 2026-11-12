"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";

/**
 * Photo d'un avatar ; si elle ne charge plus (ancien avatar Discord retiré de leur CDN, en attendant la
 * prochaine relecture du bot), on affiche `fallback` (l'initiale) plutôt qu'une image cassée. L'échec
 * survenu avant l'hydratation est rattrapé à la pose de l'élément.
 */
export function AvatarImage({ src, size, className, fallback }: { src: string; size: number; className: string; fallback: ReactNode }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (failed === src) return fallback;
  return (
    <Image
      ref={(img) => {
        if (img?.complete && img.naturalWidth === 0) setFailed(src);
      }}
      src={src}
      alt=""
      crossOrigin="anonymous"
      referrerPolicy="no-referrer"
      width={size}
      height={size}
      onError={() => setFailed(src)}
      className={className}
      style={{ width: size, height: size }}
    />
  );
}
