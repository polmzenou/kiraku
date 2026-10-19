"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { setLocaleAction } from "@/server/actions/data";
import { segmentedFillClass, segmentedItemClass, segmentedTrackClass } from "./ui/Segmented";

export function LocaleSwitcher() {
  const t = useTranslations("locale");
  const current = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  return (
    <fieldset className="flex flex-col gap-2" disabled={pending}>
      <legend className="mb-2 text-sm font-bold text-text-muted">{t("label")}</legend>
      <div className={`${segmentedTrackClass} ${segmentedFillClass}`}>
        {routing.locales.map((locale) => (
          <button
            key={locale}
            type="button"
            lang={locale}
            aria-pressed={current === locale}
            onClick={() =>
              startTransition(async () => {
                // Mémorisée sur le compte (e-mails, notifications) ; sans session, l'action ne fait rien
                await setLocaleAction({ locale });
                router.replace(pathname, { locale });
              })
            }
            className={segmentedItemClass}
          >
            {t(locale)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
