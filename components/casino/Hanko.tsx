import { CASINO_MEDIA } from "@/lib/casino/media";

/** Cachet vermillon du casino (image peinte) portant un kanji de sceau. Décoratif. */
export function Hanko({ glyph, size = 28, className = "" }: { glyph: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      lang="ja"
      className={`inline-grid shrink-0 place-items-center bg-[length:100%_100%] bg-center font-seal leading-none text-washi-paper ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.62, backgroundImage: `url(${CASINO_MEDIA.fx.hanko})` }}
    >
      {glyph}
    </span>
  );
}
