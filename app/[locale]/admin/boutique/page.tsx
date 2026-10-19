import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ShopItemForm } from "@/components/admin/ShopItemForm";
import { Link } from "@/i18n/navigation";
import { localize, parseLocalized } from "@/lib/boosters/types";
import type { ShopItemInput } from "@/lib/economy/shop";
import { requireAdmin } from "@/server/admin";
import { prisma } from "@/server/db";
import { lotOptions } from "@/server/economy/admin-queries";

/** Boutique : articles en Zeni (prix en euros enregistrés mais inertes), journal des achats. */
export default async function AdminShopPage({ searchParams }: PageProps<"/[locale]/admin/boutique">) {
  await requireAdmin();
  const [t, format, locale, sp] = await Promise.all([getTranslations("admin.economy"), getFormatter(), getLocale(), searchParams]);
  const editId = typeof sp.id === "string" ? sp.id : null;

  const [items, lots, purchases] = await Promise.all([
    prisma.shopItem.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], include: { _count: { select: { purchases: true } } } }),
    lotOptions(locale),
    prisma.purchase.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        currency: true,
        amount: true,
        status: true,
        createdAt: true,
        user: { select: { username: true } },
        shopItem: { select: { name: true } },
      },
    }),
  ]);

  const editing = editId ? items.find((i) => i.id === editId) : undefined;
  const initial: ShopItemInput | null = editing
    ? {
        id: editing.id,
        slug: editing.slug,
        name: parseLocalized(editing.name),
        description: (() => {
          const d = editing.description as { fr?: unknown; en?: unknown } | null;
          return { fr: typeof d?.fr === "string" ? d.fr : "", en: typeof d?.en === "string" ? d.en : "" };
        })(),
        lotId: editing.lotId,
        priceZeni: editing.priceZeni,
        priceCents: editing.priceCents,
        stripePriceId: editing.stripePriceId,
        perUserLimit: editing.perUserLimit,
        limitPeriod: editing.limitPeriod,
        startsAt: editing.startsAt,
        endsAt: editing.endsAt,
        active: editing.active,
        sortOrder: editing.sortOrder,
      }
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-title text-2xl font-bold">{t("shopTitle")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("shopIntro")}</p>
      </div>

      <ShopItemForm key={editId ?? "new"} initial={initial} lots={lots} />

      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id} className="flex flex-col gap-1 lacquer rounded-card p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="font-bold">
                {localize(parseLocalized(item.name), locale)}
                {!item.active && <span className="ml-2 text-xs text-text-muted">{t("inactive")}</span>}
              </p>
              <p className="text-xs text-text-muted">
                {t("itemMeta", { slug: item.slug, price: item.priceZeni ?? 0, sold: item._count.purchases })}
              </p>
            </div>
            <Link href={{ pathname: "/admin/boutique", query: { id: item.id } }} className="inline-flex min-h-11 items-center text-sm text-link underline underline-offset-4">
              {t("edit")}
            </Link>
          </li>
        ))}
      </ul>

      <section className="flex flex-col gap-2">
        <h3 className="font-title text-lg font-bold">{t("purchases")}</h3>
        {purchases.length === 0 ? (
          <p className="text-sm text-text-muted">{t("purchasesEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {purchases.map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2 rounded-control border border-border bg-surface p-2">
                <span>
                  {t("purchase", {
                    user: p.user.username,
                    item: localize(parseLocalized(p.shopItem.name), locale),
                    amount: p.amount,
                    currency: p.currency,
                    status: p.status,
                  })}
                </span>
                <time dateTime={p.createdAt.toISOString()} className="text-xs text-text-muted">
                  {format.dateTime(p.createdAt, { dateStyle: "short", timeStyle: "short" })}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
