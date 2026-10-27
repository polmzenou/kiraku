import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { BoosterArt } from "@/components/boosters/BoosterArt";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Link } from "@/i18n/navigation";
import { localize } from "@/lib/boosters/types";
import { requireAdmin } from "@/server/admin";
import { adminFocusBoosters } from "@/server/admin-boosters";

/** Boosters Focus série : œuvres mises en avant, dates et statut. Modifiables comme tout type. */
export default async function AdminFocusPage() {
  await requireAdmin();
  const [t, locale, format, boosters] = await Promise.all([getTranslations("admin"), getLocale(), getFormatter(), adminFocusBoosters()]);
  const date = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" });
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-2xl font-bold">{t("focus.title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("focus.intro")}</p>
        <ButtonLink href="/admin/focus/nouveau" variant="primary" className="self-start">
          {t("focus.new")}
        </ButtonLink>
      </div>
      {boosters.length === 0 ? (
        <p className="text-sm text-text-muted">{t("focus.empty")}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {boosters.map(({ type, series }) => {
            const ended = type.endsAt !== null && type.endsAt <= now;
            return (
              <li key={type.slug} className="flex gap-3 lacquer rounded-card p-3">
                <div className="w-12 shrink-0">
                  <BoosterArt shape={type.shape} theme={type.theme} emblem={type.emblem} name="" contents="" compact />
                </div>
                <div className="flex min-w-0 flex-col gap-1 text-sm">
                  <Link href={`/admin/boosters/types/${type.slug}`} className="font-bold underline-offset-4 hover:underline">
                    {localize(type.name, locale)}
                  </Link>
                  <span className="text-text-muted">{series.length > 0 ? format.list(series, { type: "conjunction" }) : t("focus.noSeries")}</span>
                  <span className="text-text-muted">
                    {type.startsAt && type.endsAt
                      ? t("banners.dates", { start: date(type.startsAt), end: date(type.endsAt) })
                      : type.endsAt
                        ? t("focus.until", { end: date(type.endsAt) })
                        : t("banners.noDates")}
                  </span>
                  <span className={ended ? "text-shu" : "text-text-muted"}>
                    {ended ? t("focus.ended") : type.active ? t("types.status.open") : t("types.reason.inactive")}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
