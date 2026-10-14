import type { CSSProperties, ReactNode } from "react";
import type { BoosterShape, BoosterTheme } from "@/lib/boosters/types";

export type BoosterArtProps = {
  shape: BoosterShape;
  theme: BoosterTheme;
  /** Kanji au pinceau de l'étiquette. */
  emblem: string;
  name: string;
  tagline?: string;
  /** Contenance en japonais, ex. « 四枚入 ». */
  contents: string;
  /** Sachet doré (feuille d'or) ou divin (nacre) dans la scène d'ouverture. */
  variant?: "golden" | "divine";
  /** Vignette (panneau, barre du bas) : sans nom ni accroche. */
  compact?: boolean;
  /**
   * Sachet seulement : la bande du haut et le corps sont séparés (bords sertis chacun de leur côté)
   * et `renderBand` enveloppe la bande (geste de déchirure, envol).
   */
  renderBand?: (band: ReactNode) => ReactNode;
  /** Ouverture : le rabat (pochibukuro) ou le couvercle et le cordon (jūbako) sont dessinés par la scène. */
  hideCover?: boolean;
  /** Calque posé au-dessus du dessin, qui hérite de ses couleurs (rabat animé, lumière, matière). */
  overlay?: ReactNode;
  className?: string;
};

/**
 * Booster dessiné en CSS d'après la planche : sachet métallisé serti en dents de scie, pochibukuro
 * (enveloppe à rabat et cordon) ou jūbako (boîte laquée à étages). Couleur, ombre et motif wagara
 * propres à chaque type. Purement décoratif : le nom accessible est porté par le parent.
 */
export function BoosterArt(props: BoosterArtProps) {
  const { shape, theme, variant, overlay, className = "" } = props;
  const vars = { "--booster-base": theme.base, "--booster-dark": theme.dark } as CSSProperties;
  return (
    <div aria-hidden="true" className={`w-full select-none drop-shadow-[0_10px_10px_rgb(0_0_0/0.5)] ${className}`}>
      <div
        className={`booster-art wagara-${theme.pattern} relative aspect-[5/7] w-full`}
        data-ink={variant === "divine" ? "dark" : theme.ink}
        data-variant={variant}
        style={vars}
      >
        {shape === "POCHIBUKURO" ? <Pochibukuro {...props} /> : shape === "JUBAKO" ? <Jubako {...props} /> : <Sachet {...props} />}
        {overlay}
      </div>
    </div>
  );
}

function Label({ emblem, contents, compact }: Pick<BoosterArtProps, "emblem" | "contents" | "compact">) {
  return (
    <div className="tanzaku flex h-[50%] w-[46%] flex-col items-center justify-between gap-[1.5cqw] rounded-[1.5cqw] py-[4.5cqw] shadow-[0_0_0_1px_rgb(0_0_0/0.25),0_0_0_2.6cqw_rgb(255_255_255/0.16),0_6px_12px_rgb(0_0_0/0.35)]">
      <span lang="ja" className="font-seal text-[25cqw] leading-none text-[var(--booster-dark)]">
        {emblem}
      </span>
      <span className="h-[1.4cqw] w-[40%] bg-shu-btn" />
      {!compact && (
        <span lang="ja" className="font-title text-[6cqw] leading-none font-bold whitespace-nowrap text-sumi-muted [writing-mode:vertical-rl]">
          {contents}
        </span>
      )}
    </div>
  );
}

function Title({ name, tagline, compact }: Pick<BoosterArtProps, "name" | "tagline" | "compact">) {
  if (compact) return null;
  return (
    <div className="flex max-w-full flex-col items-center gap-[1cqw] text-center">
      <span className="font-title text-[9.5cqw] leading-tight font-extrabold text-[var(--ink)] [text-shadow:var(--ink-shadow)]">
        {name}
      </span>
      {tagline && <span className="text-[7cqw] leading-tight text-[var(--ink-2)]">{tagline}</span>}
    </div>
  );
}

function Sachet({ emblem, name, tagline, contents, compact, renderBand }: BoosterArtProps) {
  const split = renderBand !== undefined;
  const band = (
    <div className={`booster-crimp relative flex h-full w-full items-end justify-center pb-[2.2cqw] ${split ? "zig-top" : ""}`}>
      {!compact && (
        <span className="flex items-center gap-[2cqw] text-[6cqw] leading-none font-bold tracking-[0.35em] text-white/85">
          <span lang="ja" className="flex size-[9cqw] items-center justify-center rounded-[1cqw] bg-shu-btn font-seal text-[6.5cqw] tracking-normal text-washi-paper">
            気
          </span>
          KIRAKU
        </span>
      )}
      {/* Pointillés de la ligne de déchirure */}
      <span className="absolute inset-x-[4%] bottom-0 border-b border-dashed border-white/45" />
    </div>
  );

  return (
    <div className={`absolute inset-0 ${split ? "" : "zig-both"}`}>
      {split ? renderBand(band) : <div className="absolute inset-x-0 top-0 h-[13%]">{band}</div>}
      <div
        className={`booster-foil absolute inset-x-0 top-[13%] bottom-0 flex flex-col items-center justify-between overflow-hidden px-[8%] pt-[7%] pb-[12%] shadow-[inset_1px_0_0_rgb(255_255_255/0.18),inset_-1px_0_0_rgb(0_0_0/0.3)] ${
          split ? "zig-bottom" : ""
        }`}
      >
        <span className="booster-glint pointer-events-none absolute inset-0" />
        <Label emblem={emblem} contents={contents} compact={compact} />
        <Title name={name} tagline={tagline} compact={compact} />
        <span className="booster-crimp absolute inset-x-0 bottom-0 h-[6%]" />
      </div>
    </div>
  );
}

/** Enveloppe du pochibukuro (le rabat animé de la scène s'y aligne). */
export const POCHI_BODY = "absolute inset-x-[6%] top-[14%] bottom-[6%]";

function Pochibukuro({ emblem, name, tagline, compact, hideCover }: BoosterArtProps) {
  return (
    <div className={`booster-foil ${POCHI_BODY} flex flex-col items-center justify-end gap-[3cqw] overflow-hidden rounded-[4cqw] pb-[10%]`}>
      {!hideCover && <div className="booster-flap absolute inset-x-0 top-0 h-[40%]" />}
      <div className="booster-cord absolute inset-x-0 top-[58%] h-[4cqw]" />
      <span
        lang="ja"
        className="booster-coin absolute top-[28%] left-1/2 flex size-[26cqw] -translate-x-1/2 items-center justify-center rounded-full font-seal text-[14cqw] leading-none text-[#3e2a08] shadow-[0_3px_6px_rgb(0_0_0/0.4)]"
      >
        {emblem}
      </span>
      {!compact && (
        <>
          <span className="relative rounded-[2cqw] bg-[#f4ede0] px-[5cqw] py-[2.5cqw] font-title text-[8.5cqw] leading-tight font-extrabold text-sumi">
            {name}
          </span>
          {tagline && <span className="relative text-center text-[7cqw] leading-tight text-[var(--ink-2)]">{tagline}</span>}
        </>
      )}
    </div>
  );
}

/** Couvercle et cordon du jūbako (la scène d'ouverture les anime aux mêmes positions). */
export const JUBAKO_LID = "absolute inset-x-[2%] top-[3%] h-[11%] rounded-[4cqw]";
export const JUBAKO_CORD = "absolute top-[3%] bottom-[3%] left-1/2 w-[5cqw] -translate-x-1/2";

function Jubako({ emblem, name, tagline, compact, hideCover }: BoosterArtProps) {
  return (
    <>
      <div className="booster-foil absolute inset-x-[6%] top-[10%] bottom-[3%] flex flex-col items-center justify-center gap-[6cqw] rounded-[4cqw] shadow-[inset_0_0_0_1px_rgb(217_181_86/0.4)]">
        <span className="absolute inset-x-0 top-[36%] h-[1.4cqw] bg-[#b8902f]" />
        <span className="absolute inset-x-0 top-[68%] h-[1.4cqw] bg-[#b8902f]" />
        <span
          lang="ja"
          className="relative flex size-[38cqw] items-center justify-center rounded-full border-[1.4cqw] border-[#d9b556] bg-[#15120f] font-seal text-[20cqw] leading-none text-[#d9b556]"
        >
          {emblem}
        </span>
        {!compact && (
          <>
            <span className="relative rounded-[2cqw] border border-[#b8902f] bg-[#15120f] px-[5cqw] py-[2cqw] font-title text-[8.5cqw] leading-tight font-extrabold text-[#f1e9da]">
              {name}
            </span>
            {tagline && <span className="relative px-[4cqw] text-center text-[7cqw] leading-tight text-[#cfc5b4]">{tagline}</span>}
          </>
        )}
      </div>
      {!hideCover && (
        <>
          <div className={`booster-lid ${JUBAKO_LID}`} />
          <div className={`booster-cord-v ${JUBAKO_CORD} opacity-90`} />
        </>
      )}
    </>
  );
}
