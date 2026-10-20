import type { ReactNode } from "react";
import { FRAME_KANJI, FRAME_RING, type FrameStyle } from "@/lib/profile/frames";

/**
 * Cadre d'avatar : un anneau dans la matière du style, et son sceau en bas. Sans style, l'avatar
 * est rendu tel quel.
 */
export function AvatarFrame({ frame, size, children }: { frame: FrameStyle | null; size: number; children: ReactNode }) {
  if (!frame) return <>{children}</>;
  const ring = Math.max(3, Math.round(size / 16));
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
    </span>
  );
}
