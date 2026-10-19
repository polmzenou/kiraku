import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { BoosterArt } from "@/components/boosters/BoosterArt";
import { RecomputePoolsButton, ToggleTypeButton } from "@/components/admin/BoosterTypeActions";
import { RotationPicker } from "@/components/admin/RotationPicker";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Link } from "@/i18n/navigation";
import { ROTATING_FAMILIES } from "@/lib/boosters/rotation";
import { BOOSTER_FAMILIES, localize, type BoosterTypeView } from "@/lib/boosters/types";
import { RARITIES, RARITY_SEAL } from "@/lib/catalog/rarity";
import { requireAdmin } from "@/server/admin";
import { getBoosterOffers, getBoosterRotation } from "@/server/boosters/pools";
import { getSetting } from "@/server/settings";

/** Pourquoi un type n'apparaît pas sur la page des boosters. */
function hiddenReason(type: BoosterTypeView, size: number, minPool: number, now: Date) {
  if (type.filter === null) return "filter" as const;
  if (!type.active) return "inactive" as const;
  if ((type.startsAt && type.startsAt > now) || (type.endsAt && type.endsAt <= now)) return "dates" as const;
  if (size < minPool) return "pool" as const;
  return null;
}

export default async function AdminBoosterTypesPage() {
  await requireAdmin();
  const [t, tRotation, tBoosters, format, locale, offers, rotation, minPool, timeZone] = await Promise.all([
    getTranslations("admin.types"),
    getTranslations("admin.rotation"),
    getTranslations("boosters"),
    getFormatter(),
    getLocale(),
    getBoosterOffers(),
    getBoosterRotation(),
    getSetting("booster.minPool"),
    getSetting("game.timeZone"),
  ]);
  const now = new Date();
  const bySlug = new Map(offers.map((o) => [o.type.slug, o.type]));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h2 className="font-title text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro", { min: minPool })}</p>
        <div className="flex flex-wrap gap-2">
          <RecomputePoolsButton />
          <ButtonLink href="/admin/bannieres/nouvelle" variant="primary">
            {t("newBanner")}
          </ButtonLink>
        </div>
      </div>

      <section aria-labelledby="rotation-titre" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 id="rotation-titre" className="font-title text-lg font-bold">
            {tRotation("title")}
          </h3>
          <p className="max-w-prose text-sm text-text-muted">
            {tRotation("intro", {
              hours: rotation.hours,
              end: format.dateTime(rotation.window.endsAt, { timeStyle: "short", timeZone }),
            })}
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {ROTATING_FAMILIES.map((family) => (
            <RotationPicker
              key={family}
              family={family}
              title={tBoosters(`families.${family}.title`)}
              candidates={rotation.candidates[family].flatMap((slug) => {
                const type = bySlug.get(slug);
                return type ? [{ slug, name: localize(type.name, locale), emblem: type.emblem }] : [];
              })}
              selected={rotation.selection[family].slugs}
              pinned={rotation.selection[family].pinned}
            />
          ))}
        </div>
      </section>

      {BOOSTER_FAMILIES.map((family) => {
        const items = offers.filter((o) => o.type.family === family);
        if (items.length === 0) return null;
        return (
          <section key={family} className="flex flex-col gap-3">
            <h3 className="font-title text-lg font-bold">{tBoosters(`families.${family}.title`)}</h3>
            <ul className="grid gap-3 md:grid-cols-2">
              {items.map(({ type, counts, size, availability, rotation: turn }) => {
                const min = type.minPoolSize ?? minPool;
                const reason = turn === "resting" ? "rotation" : availability === "hidden" ? hiddenReason(type, size, min, now) : null;
                const name = localize(type.name, locale);
                return (
                  <li key={type.slug} className="flex gap-3 rounded-lg border border-border bg-surface p-3">
                    <div className="w-12 shrink-0">
                      <BoosterArt shape={type.shape} theme={type.theme} emblem={type.emblem} name="" contents="" compact />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <Link href={`/admin/boosters/types/${type.slug}`} className="font-bold underline-offset-4 hover:underline">
                          {name}
                        </Link>
                        <span
                          className={`rounded-full border px-2 text-xs font-bold ${
                            availability === "open"
                              ? "border-rarity-uncommon text-rarity-uncommon"
                              : availability === "locked"
                                ? "border-ai text-ai"
                                : "border-border text-text-muted"
                          }`}
                        >
                          {t(`status.${availability}`)}
                          {reason && ` · ${t(`reason.${reason}`, { min })}`}
                          {turn === "featured" && ` · ${t("reason.featured")}`}
                        </span>
                      </div>
                      <p className="text-xs text-text-muted">
                        {type.slug} · {type.kind} ·{" "}
                        {type.usesFreeStock
                          ? type.priceZeni !== null
                            ? t("price.freeOr", { amount: type.priceZeni })
                            : t("price.free")
                          : type.priceZeni !== null
                            ? t("price.zeni", { amount: type.priceZeni })
                            : t("price.none")}
                      </p>
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums">
                        <span className={`font-bold ${size < min ? "text-shu" : ""}`}>{t("pool", { count: size })}</span>
                        {RARITIES.map((r) => (
                          <span key={r} className={counts[r] === 0 ? "text-shu" : "text-text-muted"}>
                            <span aria-hidden="true" lang="ja" className="font-seal">
                              {RARITY_SEAL[r]}
                            </span>{" "}
                            {counts[r]}
                          </span>
                        ))}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <ButtonLink href={`/admin/boosters/types/${type.slug}`} className="min-h-9 px-3 text-sm">
                          {t("edit")}
                        </ButtonLink>
                        <ToggleTypeButton slug={type.slug} active={type.active} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
