import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { LotForm } from "@/components/admin/LotForm";
import { LotSendPanel, ResumeBroadcastButton } from "@/components/admin/LotSendPanel";
import { LotRewards } from "@/components/economy/LotRewards";
import { Link } from "@/i18n/navigation";
import { localize, parseLocalized } from "@/lib/boosters/types";
import { parseLotItemRow, type LotInput } from "@/lib/economy/lots";
import { requireAdmin } from "@/server/admin";
import { prisma } from "@/server/db";
import { lotViews } from "@/server/economy/lot-view";

/** Lots : récompenses réutilisées par les missions, le parrainage et la boutique. */
export default async function AdminLotsPage({ searchParams }: PageProps<"/[locale]/admin/lots">) {
  await requireAdmin();
  const [t, tSend, format, locale, sp] = await Promise.all([
    getTranslations("admin.economy"),
    getTranslations("admin.lotSend"),
    getFormatter(),
    getLocale(),
    searchParams,
  ]);
  const editId = typeof sp.id === "string" ? sp.id : null;

  const [lots, types] = await Promise.all([
    prisma.lot.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        zeni: true,
        active: true,
        items: { orderBy: { id: "asc" }, select: { kind: true, boosterTypeId: true, cardId: true, rarity: true, quantity: true } },
        _count: { select: { missions: true, shopItems: true } },
      },
    }),
    prisma.boosterType.findMany({ orderBy: [{ family: "asc" }, { sortOrder: "asc" }], select: { id: true, name: true } }),
  ]);
  const [broadcasts, recentGrants] = await Promise.all([
    prisma.lotBroadcast.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, lotId: true, audience: true, status: true, granted: true, createdAt: true, admin: { select: { username: true } } },
    }),
    prisma.lotGrant.findMany({
      where: { broadcastId: null },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, lotId: true, reason: true, createdAt: true, user: { select: { id: true, username: true } }, admin: { select: { username: true } } },
    }),
  ]);
  const lotName = (id: string) => {
    const lot = lots.find((l) => l.id === id);
    return lot ? localize(parseLocalized(lot.name), locale) : id;
  };
  const views = await lotViews(
    lots.map((l) => l.id),
    locale,
  );

  const editing = editId ? lots.find((l) => l.id === editId) : undefined;
  const initial: LotInput | null = editing
    ? {
        id: editing.id,
        name: parseLocalized(editing.name),
        zeni: editing.zeni,
        active: editing.active,
        items: editing.items.flatMap((row) => parseLotItemRow(row) ?? []),
      }
    : null;
  const cardIds = initial?.items.flatMap((i) => (i.kind === "CARD" ? [i.cardId] : [])) ?? [];
  const cards = cardIds.length ? await prisma.card.findMany({ where: { id: { in: cardIds } }, select: { id: true, name: true } }) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-bold">{t("lotsTitle")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("lotsIntro")}</p>
      </div>

      <LotForm
        key={editId ?? "new"}
        initial={initial}
        boosterTypes={types.map((b) => ({ id: b.id, name: localize(parseLocalized(b.name), locale) }))}
        cardNames={Object.fromEntries(cards.map((c) => [c.id, c.name]))}
      />

      <LotSendPanel lots={lots.filter((l) => l.active).map((l) => ({ id: l.id, name: localize(parseLocalized(l.name), locale) }))} />

      {(broadcasts.length > 0 || recentGrants.length > 0) && (
        <section className="flex flex-col gap-2">
          <h3 className="font-title text-lg font-bold">{tSend("history")}</h3>
          <ul className="flex flex-col gap-2 text-sm">
            {broadcasts.map((b) => (
              <li key={b.id} className="flex flex-col gap-2 lacquer rounded-card p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-0.5">
                  <p className="font-bold">
                    {lotName(b.lotId)} · {tSend(`audiences.${b.audience === "ALL" ? "ALL" : "REGISTERED"}`)}
                  </p>
                  <p className="text-text-muted">
                    {tSend(b.status === "DONE" ? "broadcastDone" : "broadcastRunning", { count: b.granted })} ·{" "}
                    {format.dateTime(b.createdAt, { dateStyle: "short", timeStyle: "short" })} · {b.admin.username}
                  </p>
                </div>
                {b.status === "RUNNING" && <ResumeBroadcastButton broadcastId={b.id} />}
              </li>
            ))}
            {recentGrants.map((g) => (
              <li key={g.id} className="lacquer rounded-card p-3">
                <p>
                  <span className="font-bold">{lotName(g.lotId)}</span> →{" "}
                  <Link href={`/admin/utilisateurs/${g.user.id}`} className="text-link underline underline-offset-4">
                    {g.user.username}
                  </Link>
                </p>
                <p className="text-text-muted">
                  {format.dateTime(g.createdAt, { dateStyle: "short", timeStyle: "short" })} · {g.admin.username}
                  {g.reason && <> · {g.reason}</>}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ul className="flex flex-col gap-2">
        {lots.map((lot) => (
          <li key={lot.id} className="flex flex-col gap-2 lacquer rounded-card p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="font-bold">
                {localize(parseLocalized(lot.name), locale)}
                {!lot.active && <span className="ml-2 text-xs text-text-muted">{t("inactive")}</span>}
              </p>
              <LotRewards lot={views.get(lot.id)} />
              <p className="text-xs text-text-muted">{t("lotUsage", { missions: lot._count.missions, items: lot._count.shopItems })}</p>
            </div>
            <Link href={{ pathname: "/admin/lots", query: { id: lot.id } }} className="inline-flex min-h-11 items-center text-sm text-link underline underline-offset-4">
              {t("edit")}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
