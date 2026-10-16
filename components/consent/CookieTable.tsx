import { getTranslations } from "next-intl/server";
import { STORAGE_REGISTRY, type StorageDuration } from "@/lib/consent/registry";

/** Tableau des cookies et stockages locaux, généré depuis le registre (lib/consent/registry.ts). */
export async function CookieTable() {
  const t = await getTranslations("consent");
  const duration = (d: StorageDuration) =>
    d.unit === "session" || d.unit === "persistent" ? t(`durations.${d.unit}`) : t(`durations.${d.unit}`, { count: d.value });

  return (
    <ul className="flex flex-col gap-3">
      {STORAGE_REGISTRY.map((entry) => (
        <li key={entry.name} className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3 text-sm">
          <p className="font-bold break-all">{entry.name}</p>
          <p className="text-text-muted">{t(`purposes.${entry.purpose}`)}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-text-muted">{t("table.kind")}</dt>
            <dd>{t(`kinds.${entry.kind}`)}</dd>
            <dt className="text-text-muted">{t("table.category")}</dt>
            <dd>{t(`categories.${entry.category}`)}</dd>
            <dt className="text-text-muted">{t("table.duration")}</dt>
            <dd>{duration(entry.duration)}</dd>
            <dt className="text-text-muted">{t("table.consent")}</dt>
            <dd>{entry.exempt ? t("table.exempt") : t("table.required")}</dd>
          </dl>
        </li>
      ))}
    </ul>
  );
}
