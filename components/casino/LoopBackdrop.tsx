"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { backdropMode } from "@/lib/battle/arena-backdrop";
import type { LoopMedia } from "@/lib/casino/media";
import { useFxLevel } from "../motion/MotionPreference";

// Fond peint du casino (façade, salle) : l'image fixe est rendue par le serveur (<picture> : portrait sur
// téléphone, paysage au-delà de 48rem), la boucle vidéo n'est ajoutée qu'après le montage et apparaît en
// fondu une fois lancée. Image seule en mouvement réduit, en économie de données ou si la lecture est
// refusée ; pause hors de l'écran et onglet caché (même logique que les fonds de vitrine).

const WIDE = "(min-width: 48rem)";

function subscribeWide(onChange: () => void) {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const subscribeNothing = () => () => {};

function saveDataWanted() {
  return (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
}

export function LoopBackdrop({
  mobile,
  desktop,
  priority = false,
  className = "",
}: {
  mobile: LoopMedia;
  desktop: LoopMedia;
  /** Image au-dessus de la ligne de flottaison : chargée tout de suite. */
  priority?: boolean;
  className?: string;
}) {
  const level = useFxLevel();
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false);
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const saveData = useSyncExternalStore(subscribeNothing, saveDataWanted, () => false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const holder = useRef<HTMLSpanElement>(null);
  const video = useRef<HTMLVideoElement>(null);

  const media = wide ? desktop : mobile;
  const src = media.loop;
  const mode = mounted && !failed && src ? backdropMode(level, saveData) : "still";

  useEffect(() => {
    const v = video.current;
    const box = holder.current;
    if (mode !== "video" || !v || !box) return;
    v.muted = true;
    let visible = false;
    const sync = () => {
      if (visible && !document.hidden) {
        v.play().catch((e: unknown) => {
          if (!(e instanceof DOMException && e.name === "AbortError")) setFailed(true);
        });
      } else {
        v.pause();
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    observer.observe(box);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [mode, src]);

  return (
    <span ref={holder} aria-hidden="true" className={`absolute inset-0 -z-10 overflow-hidden ${className}`}>
      <picture>
        <source media={WIDE} srcSet={desktop.still} />
        <img
          src={mobile.still}
          alt=""
          decoding="async"
          fetchPriority={priority ? "high" : undefined}
          draggable={false}
          className="absolute inset-0 size-full object-cover"
        />
      </picture>
      {mode === "video" && src && (
        <video
          key={src}
          ref={video}
          src={src}
          poster={media.still}
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          tabIndex={-1}
          onPlaying={() => setPlaying(src)}
          className={`absolute inset-0 size-full object-cover transition-opacity duration-500 motion-reduce:transition-none ${playing === src ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </span>
  );
}
