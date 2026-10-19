// Puces de filtre : pilule laquée, pilule claire quand active, pastille de couleur facultative.

export function chipClasses(active: boolean, className = "") {
  return (
    "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-pill px-3.5 text-sm whitespace-nowrap transition-[background-color,color,transform] " +
    "duration-150 active:scale-[.97] motion-reduce:transition-none " +
    (active ? "bg-text font-bold text-bg" : "lacquer text-text hover:border-text-muted/50") +
    ` ${className}`
  );
}

/** Pastille de couleur d'une puce (rareté, statut). */
export function ChipDot({ color }: { color: string }) {
  return <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: color }} />;
}
