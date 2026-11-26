"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { setSpoilerBlurAction } from "@/server/actions/spoiler";
import { Link } from "@/i18n/navigation";
import { useSpoilerPreference } from "./spoiler/SpoilerPreference";
import { segmentedFillClass, segmentedItemClass, segmentedTrackClass } from "./ui/Segmented";

const MODES = [
  { blur: true, label: "hide" },
  { blur: false, label: "show" },
] as const;

/**
 * Mode spoiler du compte : floute l'illustration des cartes spoil (par défaut) ou affiche tout. Appliqué tout de
 * suite, sans recharger, puis enregistré ; un échec rétablit le réglage précédent. Masqué sans compte.
 */
export function SpoilerToggle({ showUniversesLink = false }: { showUniversesLink?: boolean }) {
  const t = useTranslations("spoiler");
  const hint = useId();
  const { prefs, setPrefs, canSave } = useSpoilerPreference();
  const [failed, setFailed] = useState(false);
  if (!canSave) return null;

  async function choose(blur: boolean) {
    if (blur === prefs.blur) return;
    setFailed(false);
    setPrefs((p) => ({ ...p, blur }));
    const result = await setSpoilerBlurAction({ blur }).catch(() => null);
    if (!result?.ok) {
      setPrefs((p) => ({ ...p, blur: !blur }));
      setFailed(true);
    }
  }

  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={hint}>
      <legend className="mb-2 text-sm font-bold text-text-muted">{t("label")}</legend>
      <div className={`${segmentedTrackClass} ${segmentedFillClass}`}>
        {MODES.map(({ blur, label }) => (
          <button key={label} type="button" aria-pressed={prefs.blur === blur} onClick={() => choose(blur)} className={segmentedItemClass}>
            {t(label)}
          </button>
        ))}
      </div>
      <p id={hint} className="text-xs text-text-muted">
        {t("hint")}
      </p>
      {failed && (
        <p role="alert" className="text-xs text-shu">
          {t("saveFailed")}
        </p>
      )}
      {showUniversesLink && (
        <Link href="/compte/spoilers" className="inline-flex min-h-11 w-fit items-center text-sm font-bold text-ai underline-offset-4 hover:underline">
          {t("byUniverseLink")}
        </Link>
      )}
    </fieldset>
  );
}
