"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export function LocaleSwitcher() {
  const t = useTranslations("locale");
  const current = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  return (
    <fieldset className="flex flex-col gap-2" disabled={pending}>
      <legend className="mb-2 text-sm text-text-muted">{t("label")}</legend>
      <div className="grid grid-cols-2 gap-2">
        {routing.locales.map((locale) => (
          <button
            key={locale}
            type="button"
            lang={locale}
            aria-pressed={current === locale}
            onClick={() => startTransition(() => router.replace(pathname, { locale }))}
            className="min-h-11 rounded-button border border-border bg-surface-2 px-3 text-sm aria-pressed:border-shu aria-pressed:text-shu"
          >
            {t(locale)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
