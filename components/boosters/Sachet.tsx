import type { CSSProperties, ReactNode } from "react";
import type { SachetTheme } from "@/lib/boosters/catalog";

type SachetProps = {
  theme: SachetTheme;
  name: string;
  tagline?: string;
  /** Contenance en japonais sur l'étiquette, ex. « 四枚入 ». */
  contents: string;
  /**
   * Ouverture : la bande du haut et le corps sont séparés (bords sertis chacun de leur côté),
   * et `renderBand` enveloppe la bande (geste de déchirure, envol).
   */
  renderBand?: (band: ReactNode) => ReactNode;
  className?: string;
};

/**
 * Booster : sachet métallisé classique, bords sertis en dents de scie, reflet diagonal, motif wagara
 * de sa famille, étiquette tanzaku en washi avec le kanji au pinceau. Seuls la couleur et le motif
 * changent d'une famille à l'autre. Purement décoratif : le nom accessible est porté par le parent.
 */
export function Sachet({ theme, name, tagline, contents, renderBand, className = "" }: SachetProps) {
  const split = renderBand !== undefined;
  const vars = {
    "--sachet-base": theme.base,
    "--sachet-light": theme.light,
    "--sachet-dark": theme.dark,
  } as CSSProperties;

  const band = (
    <div className={`sachet-crimp relative flex h-full w-full items-center justify-center ${split ? "zig-top" : ""}`}>
      <span className="flex items-center gap-[2cqw] pt-[2cqw] text-[5cqw] font-bold tracking-[0.35em] text-white/85">
        <span className="inline-block size-[5cqw] rounded-[1px] bg-shu-btn" />
        KIRAKU
      </span>
      {/* Pointillés de la ligne de déchirure */}
      <span className="absolute inset-x-[4%] bottom-0 border-b border-dashed border-white/45" />
    </div>
  );

  return (
    <div aria-hidden="true" className={`w-full drop-shadow-[0_5px_6px_rgb(0_0_0/0.45)] ${className}`}>
      <div className={`sachet relative aspect-[3/4] w-full select-none ${split ? "" : "zig-both"}`} style={vars}>
        {split ? renderBand(band) : <div className="absolute inset-x-0 top-0 h-[13%]">{band}</div>}

        <div
          className={`sachet-metal wagara-${theme.pattern} absolute inset-x-0 top-[13%] bottom-0 flex flex-col items-center overflow-hidden ${
            split ? "zig-bottom" : ""
          }`}
        >
          <div className="tanzaku mt-[9%] flex aspect-[4/5] w-[46%] flex-col items-center justify-center gap-[2.5cqw] rounded-[1.5cqw] shadow-[0_1px_3px_rgb(0_0_0/0.35)]">
            <span lang="ja" className="font-seal text-[24cqw] leading-none text-sumi">
              {theme.emblem}
            </span>
            <span className="h-[1.4cqw] w-[42%] rounded-full bg-shu-btn" />
            <span lang="ja" className="font-seal text-[5.5cqw] leading-none tracking-[0.2em] text-sumi-muted">
              {contents}
            </span>
          </div>
          <span className="mt-[6cqw] max-w-[90%] text-center font-title text-[10cqw] leading-tight font-bold text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]">
            {name}
          </span>
          {tagline && (
            <span className="mt-[1cqw] max-w-[90%] text-center text-[6cqw] leading-tight text-white/80">{tagline}</span>
          )}
          <span className="sachet-crimp absolute inset-x-0 bottom-0 h-[9%]" />
        </div>
      </div>
    </div>
  );
}
