import { getLocale, getTranslations } from "next-intl/server";
import { BoosterArt } from "@/components/boosters/BoosterArt";
import { GuaranteedGrantForm, type GuaranteedOption } from "@/components/admin/GuaranteedGrantForm";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Link } from "@/i18n/navigation";
import { contentsLabel } from "@/lib/boosters/catalog";
import { effectiveSlotFloors, localize, SLUG_PATTERN } from "@/lib/boosters/types";
import { rarityColor } from "@/lib/catalog/appearance";
import { orderedKeys } from "@/lib/catalog/definitions";
import { requireAdmin } from "@/server/admin";
import { adminGuaranteedBoosters } from "@/server/admin-boosters";
import { getBoosterRules } from "@/server/boosters/rules";
import { getRarityDefinitions } from "@/server/catalog/rarities";

/**
 * Boosters garantis : un par rareté de variante, jamais proposés ni vendus aux joueurs. Réservé à l'admin
 * (absent de DEV_ADMIN_PAGES : le DEV reçoit un 404), qui les donne ici à qui il veut.
 */
export default async function AdminGuaranteedBoostersPage({ searchParams }: PageProps<"/[locale]/admin/boosters/garantis">) {
  await requireAdmin();
  const [t, locale, items, definitions, rules, sp] = await Promise.all([
    getTranslations("admin.guaranteed"),
    getLocale(),
    adminGuaranteedBoosters(),
    getRarityDefinitions(),
    getBoosterRules(),
    searchParams,
  ]);
  const order = orderedKeys(definitions);
  const byKey = new Map(definitions.map((d) => [d.key, d]));
  const rank = (rarity: string | null) => (rarity ? order.indexOf(rarity) : -1);
  const sorted = [...items].sort((a, b) => rank(a.type.guaranteed) - rank(b.type.guaranteed) || a.type.slug.localeCompare(b.type.slug));
  // Booster choisi depuis une tuile (« Donner ») : un slug valide seulement
  const asked = Array.isArray(sp.b) ? sp.b[0] : sp.b;
  const initial = asked && SLUG_PATTERN.test(asked) ? asked : undefined;

  const rarityOf = (key: string | null) => {
    const def = key ? byKey.get(key) : undefined;
    if (!key || !def) return { name: key ?? "?", seal: "", color: "#c8a140" };
    return { name: locale === "en" ? def.nameEn || def.nameFr : def.nameFr, seal: def.seal, color: rarityColor(key, def.appearance) };
  };
  const options: GuaranteedOption[] = sorted.map(({ type, poolCount }) => {
    const r = rarityOf(type.guaranteed);
    return { slug: type.slug, label: `${r.seal} ${r.name}`.trim(), available: poolCount > 0 };
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-text-muted">{t("empty")}</p>
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sorted.map(({ type, poolCount, held, holders }) => {
              const r = rarityOf(type.guaranteed);
              const cards = effectiveSlotFloors(type.slotFloors, rules.draw.slotFloors).length;
              const name = localize(type.name, locale);
              return (
                <li key={type.slug} className="flex flex-col gap-4 lacquer rounded-card p-4">
                  <div className="mx-auto w-[min(11rem,60%)] py-3">
                    <BoosterArt
                      shape={type.shape}
                      theme={type.theme}
                      emblem={type.emblem}
                      name={name}
                      tagline={localize(type.tagline, locale)}
                      contents={contentsLabel(cards)}
                      guarantee
                    />
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-title text-lg font-bold">{name}</h3>
                    <span className="flex items-center gap-1.5 text-sm font-bold" style={{ color: r.color }}>
                      <span aria-hidden="true" lang="ja" className="font-seal text-lg">
                        {r.seal}
                      </span>
                      {r.name}
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                    <dt className="text-text-muted">{t("pool")}</dt>
                    <dd className={`text-right font-bold tabular-nums ${poolCount === 0 ? "text-shu" : ""}`}>{poolCount}</dd>
                    <dt className="text-text-muted">{t("held")}</dt>
                    <dd className="text-right font-bold tabular-nums">{t("heldValue", { count: held, holders })}</dd>
                  </dl>
                  {poolCount === 0 && <p className="text-sm text-shu">{t("emptyRarity", { rarity: r.name })}</p>}
                  <div className="mt-auto flex flex-wrap items-center gap-3">
                    {poolCount > 0 && (
                      <ButtonLink href={`/admin/boosters/garantis?b=${type.slug}#donner`} variant="primary">
                        {t("give")}
                      </ButtonLink>
                    )}
                    <Link href={`/admin/boosters/types/${type.slug}`} className="text-sm text-link underline underline-offset-4">
                      {t("edit")}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
          <GuaranteedGrantForm key={initial ?? "first"} options={options} initial={initial} />
        </>
      )}
    </div>
  );
}
