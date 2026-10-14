/** Pièce de Zeni : ronde, dorée, percée d'un trou carré (銭). Jamais un losange. */
export function ZeniCoin({ size = 18 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex shrink-0 items-center justify-center rounded-full bg-kin shadow-[inset_0_-2px_0_rgb(0_0_0/0.25)]"
      style={{ width: size, height: size }}
    >
      <span className="rounded-[1px] bg-bg" style={{ width: size * 0.3, height: size * 0.3 }} />
    </span>
  );
}
