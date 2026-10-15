/** Titre de section : kanji vertical à gauche (縦書き) et trait de pinceau sous le titre. */
export function SectionTitle({
  kanji,
  title,
  subtitle,
  level = 2,
  id,
}: {
  id?: string;
  kanji?: string;
  title: string;
  subtitle?: string;
  level?: 1 | 2;
}) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <div className="flex min-w-0 items-start gap-3">
      {kanji && <span
        aria-hidden="true"
        lang="ja"
        className={`shrink-0 font-seal leading-none text-shu [writing-mode:vertical-rl] ${level === 1 ? "text-4xl" : "text-lg"}`}
      >
        {kanji}
      </span>}
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Heading id={id} className={`font-title font-extrabold ${level === 1 ? "text-3xl" : "text-xl"}`}>{title}</Heading>
          {subtitle && level === 2 && <p className="text-xs text-text-muted">{subtitle}</p>}
        </div>
        {subtitle && level === 1 && <p className="max-w-prose text-sm text-text-muted">{subtitle}</p>}
        <span aria-hidden="true" className="h-[3px] w-12 -skew-x-12 rounded-full bg-shu" />
      </div>
    </div>
  );
}
