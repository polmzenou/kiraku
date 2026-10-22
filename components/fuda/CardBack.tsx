"use client";

import { useId, useRef } from "react";
import { useMaterialLight } from "./useMaterialLight";
import "./CardBack.css";

/**
 * Dos commun Kiraku : laque noire, asanoha gravé, ensō d'or et sceau vermillon. `flat` : dos de
 * pile ou d'éclat, toujours immobile, sans relief filtré ni irisation en fusion (bien moins coûteux).
 */
export function CardBack({ glow = false, static: still = false, flat = false, className = "" }: {
  glow?: boolean;
  static?: boolean;
  flat?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  useMaterialLight(ref, still || flat);

  return (
    <div ref={ref} aria-hidden="true" className={`kb-back ${className}`} data-static={still || flat || undefined} data-flat={flat || undefined} data-glow={glow || undefined}>
      <svg className="kb-art" viewBox="0 0 250 350" fill="none" focusable="false">
        <defs>
          <linearGradient id={`${id}-gold`} x1="20" y1="20" x2="230" y2="330" gradientUnits="userSpaceOnUse">
            <stop stopColor="#926527" /><stop offset=".24" stopColor="#f9e8ad" /><stop offset=".45" stopColor="#b38a3f" /><stop offset=".7" stopColor="#f2d88a" /><stop offset="1" stopColor="#8e6328" />
          </linearGradient>
          <pattern id={`${id}-pattern`} className="kb-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M20 0 40 10v20L20 40 0 30V10L20 0v40M0 10l40 20M40 10 0 30M0 10h40M0 30h40M20 0 0 30m20 10L0 10M20 0l20 30M20 40l20-30" />
          </pattern>
        </defs>
        <g className="kb-emboss" strokeWidth=".7"><rect x="17" y="17" width="216" height="316" rx="4" fill={`url(#${id}-pattern)`} /></g>
        <rect x="7" y="7" width="236" height="336" rx="7" stroke={`url(#${id}-gold)`} strokeWidth="2" />
        <rect x="13" y="13" width="224" height="324" rx="4" stroke={`url(#${id}-gold)`} strokeWidth=".5" opacity=".6" />
        <g stroke={`url(#${id}-gold)`} strokeWidth="1.2">
          <path d="M24 46V24h22M204 24h22v22M24 304v22h22M204 326h22v-22" />
          <path d="m125 29 4 4-4 4-4-4 4-4Zm0 284 4 4-4 4-4-4 4-4Z" fill={`url(#${id}-gold)`} />
        </g>
        <g stroke={`url(#${id}-gold)`} strokeLinecap="round">
          <path d="M159 104c-22-15-55-12-74 8-24 25-28 63-12 91 17 31 53 43 82 30 28-12 44-42 39-69-4-20-14-35-27-43" strokeWidth="11" />
          <path d="M153 106c-25-11-51-4-69 18-22 28-19 70 7 94 20 18 51 21 72 7" strokeWidth="1.5" opacity=".75" />
          <path d="m171 121 9 12m-14-17 3 5m14 19 3 6" strokeWidth="3" />
        </g>
        <g className="kb-flakes" fill={`url(#${id}-gold)`}>
          <path d="m39 73 3-2 2 4-4 1Zm162 197 4-1 1 4-3 2ZM56 280l2-3 3 2-1 4Zm146-211 3 2-2 3-3-1ZM37 247l3-1 1 2-2 2Zm177-131 2-2 2 3-3 1Z" />
        </g>
      </svg>
      <span className="kb-iridescence" />
      <span className="kb-sheen" />
      <span className="kb-seal" lang="ja"><span className="font-seal">気楽</span></span>
      <span className="kb-wordmark">KIRAKU</span>
      <span className="kb-caption">金 · ENSŌ</span>
      <span className="kb-charge" />
    </div>
  );
}
