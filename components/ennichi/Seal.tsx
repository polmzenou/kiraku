// Sceau carré d'un écran de l'Ennichi (« 祭 », « 番 », kanji d'un palier, chance d'une ligne de l'omikuji) : vermillon,
// or ou éteint. Il s'élargit pour un mot de plusieurs kanji (« 末小吉 ») au lieu de déborder. Décoratif ; sans hook,
// utilisable côté serveur comme côté client (pages de la fête et admin).

const TONES = {
  shu: "bg-shu-btn text-washi-paper",
  kin: "bg-kin text-bg",
  mut: "bg-surface-2 text-text-muted",
} as const;

export function Seal({ kanji, size = 34, tone = "shu", className = "" }: { kanji: string; size?: number; tone?: keyof typeof TONES; className?: string }) {
  return (
    <span
      aria-hidden="true"
      lang="ja"
      className={`flex shrink-0 items-center justify-center rounded-sm px-1 font-seal ${TONES[tone]} ${className}`}
      style={{ minWidth: size, height: size, fontSize: Math.round(size * 0.5) }}
    >
      {kanji}
    </span>
  );
}
