// Onglets segmentés Urushi : une piste laquée en pilule, l'élément actif devient une pilule claire.
// Les classes sont exportées pour servir aux liens (aria-current), aux boutons (aria-pressed)
// et aux radios masqués (label:has(:checked)).

export const segmentedTrackClass = "lacquer inline-flex max-w-full items-center gap-0.5 rounded-pill p-1";

/** À ajouter quand la piste peut déborder (petits écrans) : défilement horizontal sans barre. */
export const segmentedScrollClass = "overflow-x-auto [scrollbar-width:none]";

const segmentedItemBase =
  "inline-flex min-h-10 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-pill text-sm font-bold whitespace-nowrap text-text-muted " +
  "transition-[background-color,color,transform] duration-150 hover:text-text active:scale-[.97] motion-reduce:transition-none " +
  "aria-[current=page]:bg-text aria-[current=page]:text-bg aria-[current=true]:bg-text aria-[current=true]:text-bg " +
  "aria-pressed:bg-text aria-pressed:text-bg aria-selected:bg-text aria-selected:text-bg " +
  "has-[:checked]:bg-text has-[:checked]:text-bg has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ai";

export const segmentedItemClass = `${segmentedItemBase} px-4`;

/** Marges serrées sur mobile, pour qu'une piste pleine largeur de 3 segments tienne en 320 px. */
export const segmentedCompactItemClass = `${segmentedItemBase} w-full px-2 sm:px-4`;

/** Variante pleine largeur : chaque segment prend la même place. */
export const segmentedFillClass = "w-full [&>*]:flex-1";
