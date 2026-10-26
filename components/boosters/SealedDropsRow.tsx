import { useTranslations } from "next-intl";
import type { SealedKind } from "@/lib/boosters/draw";
import type { SealedDisplay, SealedDropView } from "@/lib/boosters/view";
import { ButtonLink } from "../ui/ButtonLink";
import { BoosterArt } from "./BoosterArt";

/**
 * Sachets scellés du joueur, sur l'accueil : chacun s'ouvre sur sa propre page (?sachet=…) ou
 * s'offre depuis /amis (s'il est tombé d'un tirage et n'a jamais été offert). Le karma de
 * l'Apocalypse s'affiche sur les Apocalyptiques.
 */
export function SealedDropsRow({
  drops,
  displays,
  karma,
}: {
  drops: SealedDropView[];
  displays: Partial<Record<SealedKind, SealedDisplay>>;
  karma: { current: number; threshold: number };
}) {
  const t = useTranslations("sealed");
  const shown = drops.filter((d) => displays[d.kind]);
  if (shown.length === 0) return null;
  return (
    <section aria-labelledby="sealed-title" className="flex flex-col gap-2">
      <h2 id="sealed-title" className="flex items-center gap-2 font-title text-lg font-bold">
        <span aria-hidden="true" lang="ja" className="font-seal text-xl text-kin">
          封
        </span>
        {t("rowTitle", { count: shown.length })}
      </h2>
      <ul className="flex flex-col gap-2">
        {shown.map((d) => {
          const display = displays[d.kind]!;
          const blessed = d.kind === "apocalypse" && karma.threshold > 0 && karma.current >= karma.threshold;
          return (
            <li key={d.id} className="flex items-center gap-3 rounded-card border border-kin bg-surface p-3">
              <div className="w-14 shrink-0" aria-hidden="true">
                <BoosterArt
                  shape={display.shape}
                  theme={display.theme}
                  emblem={display.emblem}
                  name={display.name}
                  contents={display.contents}
                  compact
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="font-bold">{display.name}</p>
                <p className="text-xs text-text-muted">{display.tagline}</p>
                {d.kind === "apocalypse" && karma.threshold > 0 && (
                  <p className={`text-xs tabular-nums ${blessed ? "text-kin" : "text-text-muted"}`}>
                    {blessed ? t("karmaBlessed") : t("karma", { current: karma.current, threshold: karma.threshold })}
                  </p>
                )}
                {d.giver && <p className="text-xs text-text-muted">{t("giftedBy", { name: d.giver })}</p>}
              </div>
              <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
                <ButtonLink href={`/ouvrir/${display.slug}?sachet=${d.id}`} variant="primary">
                  {t("open")}
                </ButtonLink>
                {d.giftable && <ButtonLink href={`/amis?sachet=${d.id}`}>{t("gift")}</ButtonLink>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
