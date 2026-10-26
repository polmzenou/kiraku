import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { BoosterArt } from "@/components/boosters/BoosterArt";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Link } from "@/i18n/navigation";
import { localize } from "@/lib/boosters/types";
import { requireAdmin } from "@/server/admin";
import { adminBanners } from "@/server/admin-boosters";

export default async function AdminBannersPage() {
  await requireAdmin();
  const [t, locale, format, banners] = await Promise.all([getTranslations("admin"), getLocale(), getFormatter(), adminBanners()]);
  const date = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-2xl font-bold">{t("banners.title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("banners.intro")}</p>
        <ButtonLink href="/admin/bannieres/nouvelle" variant="primary" className="self-start">
          {t("types.newBanner")}
        </ButtonLink>
      </div>
      {banners.length === 0 ? (
        <p className="text-sm text-text-muted">{t("banners.empty")}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {banners.map((b) => (
            <li key={b.slug} className="flex gap-3 lacquer rounded-card p-3">
              <div className="w-12 shrink-0">
                <BoosterArt shape={b.shape} theme={b.theme} emblem={b.emblem} name="" contents="" compact />
              </div>
              <div className="flex min-w-0 flex-col gap-1 text-sm">
                <Link href={`/admin/boosters/types/${b.slug}`} className="font-bold underline-offset-4 hover:underline">
                  {localize(b.name, locale)}
                </Link>
                <span className="text-text-muted">
                  {b.startsAt && b.endsAt ? t("banners.dates", { start: date(b.startsAt), end: date(b.endsAt) }) : t("banners.noDates")}
                </span>
                <span className="text-text-muted">
                  {t("banners.featured", { count: b.featuredCardIds.length })} ·{" "}
                  {b.active ? t("types.status.open") : t("types.reason.inactive")}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
