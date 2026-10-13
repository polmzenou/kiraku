/** Sceau carré vermillon (hanko) portant des kanji, ex. 気楽 pour le logo. */
export function SealMark({ glyphs, size = 44 }: { glyphs: string; size?: number }) {
  const vertical = glyphs.length > 1;
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-[4px] bg-shu-btn font-seal leading-none text-washi-paper"
      style={{
        width: size,
        height: size,
        fontSize: vertical ? size * 0.4 : size * 0.62,
        writingMode: vertical ? "vertical-rl" : undefined,
      }}
    >
      {glyphs}
    </span>
  );
}
