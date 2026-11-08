"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { backdropMode } from "@/lib/battle/arena-backdrop";
import type { ThemeMedia } from "@/lib/showcase/theme-registry";
import { useFxLevel } from "../motion/MotionPreference";

// Fond vidéo d'un thème de vitrine (même logique que le fond des arènes) : l'image fixe est rendue par
// le serveur (<picture> : 3:4 sur téléphone, 16:9 au-delà de 48rem), la vidéo n'est ajoutée qu'après
// le montage (aucun écart d'hydratation) et apparaît en fondu une fois lancée. Image seule en mouvement
// réduit, en économie de données ou si la lecture est refusée ; pause hors de l'écran et onglet caché.

const WIDE = "(min-width: 48rem)";

function subscribeWide(onChange: () => void) {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const subscribeNothing = () => () => {};

/** Le navigateur demande d'économiser les données (Chrome, Android) ; l'information manque ailleurs. */
function saveDataWanted() {
  return (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
}

export function ThemeBackdrop({ media }: { media: ThemeMedia }) {
  const level = useFxLevel();
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false);
  // Faux au rendu serveur et pendant l'hydratation, vrai ensuite
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const saveData = useSyncExternalStore(subscribeNothing, saveDataWanted, () => false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const holder = useRef<HTMLSpanElement>(null);
  const video = useRef<HTMLVideoElement>(null);

  const mode = mounted && !failed ? backdropMode(level, saveData) : "still";
  const src = wide ? media.desktop.loop : media.mobile.loop;

  useEffect(() => {
    const v = video.current;
    const box = holder.current;
    if (mode !== "video" || !v || !box) return;
    v.muted = true;
    let visible = false;
    const sync = () => {
      if (visible && !document.hidden) {
        v.play().catch((e: unknown) => {
          // Une pause demandée pendant le lancement n'est pas un refus
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
    <span ref={holder} className="vt-media-holder">
      <picture>
        <source media={WIDE} srcSet={media.desktop.still} />
        <img src={media.mobile.still} alt="" decoding="async" draggable={false} className="vt-media" />
      </picture>
      {mode === "video" && (
        <video
          key={src}
          ref={video}
          className="vt-media vt-media-video"
          src={src}
          poster={wide ? media.desktop.still : media.mobile.still}
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          tabIndex={-1}
          data-ready={ready || undefined}
          onPlaying={() => setReady(true)}
        />
      )}
    </span>
  );
}
