import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ResponsiveTable } from "@/components/admin/ResponsiveTable";
import { Link } from "@/i18n/navigation";
import { exchangeTotals, EXCHANGE_KINDS, type Exchange, type ExchangeCard } from "@/lib/anticheat/exchanges";
import { z } from "@/lib/zod";
import { requireAdminView } from "@/server/admin";
import { exchangesBetween } from "@/server/anticheat/exchanges";
import { getRarityDefinitions } from "@/server/catalog/rarities";
import { prisma } from "@/server/db";

const userId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const paramsSchema = z.object({ a: userId, b: userId }).refine((p) => p.a !== p.b);

const userLink = "font-bold text-link underline underline-offset-4";

/**
 * Détail des transferts entre deux comptes reliés (puce « échanges entre eux » ou flux de /admin/multi-comptes) :
 * cadeaux, ventes, pile ou face et échanges, comptés comme la détection. Lecture seule, ouverte au DEV.
 */
export default async function AdminPairExchangesPage({ searchParams }: PageProps<"/[locale]/admin/multi-comptes/echanges">) {
  await requireAdminView();
  const raw = await searchParams;
  const parsed = paramsSchema.safeParse({ a: raw.a, b: raw.b });
  if (!parsed.success) notFound();
  const { a, b } = parsed.data;
  const users = await prisma.user.findMany({ where: { id: { in: [a, b] } }, select: { id: true, username: true } });
  if (users.length !== 2) notFound();
  const names = new Map(users.map((u) => [u.id, u.username]));
  const name = (id: string) => names.get(id) ?? id;

  const [t, format, locale, rarities, { rows, truncated }] = await Promise.all([
    getTranslations("admin.multiAccounts.exchanges"),
    getFormatter(),
    getLocale(),
    getRarityDefinitions(),
    exchangesBetween(a, b),
  ]);
  const rarityName = new Map(rarities.map((r) => [r.key, locale === "en" ? r.nameEn : r.nameFr]));
  const totals = exchangeTotals(rows, a, b);

  const cardLabel = (c: ExchangeCard) => (c ? t("card", { name: c.name, rarity: rarityName.get(c.rarity) ?? c.rarity }) : t("unknownCard"));
  const cardLink = (c: ExchangeCard) =>
    c ? <Link href={`/wiki/${c.publicId}`} className="underline underline-offset-2">{cardLabel(c)}</Link> : <span className="text-text-muted">{cardLabel(c)}</span>;
  const detail = (r: Exchange) => {
    switch (r.kind) {
      case "gift":
        if (r.giftKind === "CARD") return cardLink(r.card);
        return <span>{t(`gift.${r.giftKind}`, { zeni: r.zeni })}</span>;
      case "auction":
      case "buyOrder":
        return <span className="flex flex-wrap items-center gap-x-1">{cardLink(r.card)}<span className="tabular-nums text-kin">{t("forZeni", { zeni: r.zeni })}</span></span>;
      case "flip":
        return <span className="flex flex-wrap items-center gap-x-1">{cardLink(r.card)}<span className="text-text-muted">{t("flipAgainst")}</span>{cardLink(r.kept)}</span>;
      case "trade":
      case "listing":
        return (
          <span className="flex flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-x-1"><span className="text-text-muted">{t("gives", { name: name(r.fromId) })}</span>{cardLink(r.given)}</span>
            <span className="flex flex-wrap items-center gap-x-1"><span className="text-text-muted">{t("gives", { name: name(r.toId) })}</span>{cardLink(r.received)}</span>
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/multi-comptes" className="inline-flex min-h-11 w-fit items-center text-sm text-link underline underline-offset-4">{t("back")}</Link>
      <div className="flex flex-col gap-2">
        <h2 className="flex flex-wrap items-center gap-2 font-heading text-2xl font-bold">
          <span>{t("titleBetween")}</span>
          <Link href={`/admin/utilisateurs/${a}`} className={userLink}>{name(a)}</Link>
          <span aria-hidden="true" className="text-text-muted">↔</span>
          <Link href={`/admin/utilisateurs/${b}`} className={userLink}>{name(b)}</Link>
        </h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          [t("total"), format.number(totals.total)],
          [t("directed", { from: name(a), to: name(b) }), format.number(totals.ab)],
          [t("directed", { from: name(b), to: name(a) }), format.number(totals.ba)],
          [t("swaps"), format.number(totals.swaps)],
        ].map(([label, value]) => (
          <div key={label} className="flex min-w-0 flex-col gap-0.5 lacquer rounded-card p-3">
            <dt className="truncate text-xs text-text-muted">{label}</dt>
            <dd className="text-lg font-bold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <ul className="flex flex-wrap gap-2 text-xs">
        {EXCHANGE_KINDS.filter((k) => totals.byKind[k] > 0).map((k) => (
          <li key={k} className="rounded-pill border border-border bg-surface-2 px-3 py-1">{t(`kinds.${k}`)} · <span className="font-bold tabular-nums">{format.number(totals.byKind[k])}</span></li>
        ))}
        {totals.zeniAb > 0 && <li className="rounded-pill border border-border bg-surface-2 px-3 py-1">{t("salesZeni", { buyer: name(b), seller: name(a), zeni: totals.zeniAb })}</li>}
        {totals.zeniBa > 0 && <li className="rounded-pill border border-border bg-surface-2 px-3 py-1">{t("salesZeni", { buyer: name(a), seller: name(b), zeni: totals.zeniBa })}</li>}
      </ul>
      {truncated && <p className="text-sm text-text-muted">{t("truncated")}</p>}

      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">{t("empty")}</p>
      ) : (
        <ResponsiveTable
          caption={t("tableCaption")}
          columns={[
            { key: "at", label: t("columns.at"), className: "whitespace-nowrap", primary: true },
            { key: "kind", label: t("columns.kind") },
            { key: "direction", label: t("columns.direction"), className: "whitespace-nowrap" },
            { key: "detail", label: t("columns.detail"), className: "min-w-56" },
          ]}
          rows={rows.map((r) => ({
            id: `${r.kind}-${r.id}`,
            cells: {
              at: format.dateTime(r.at, { dateStyle: "short", timeStyle: "short" }),
              kind: t(`kinds.${r.kind}`),
              direction:
                t(r.kind === "trade" || r.kind === "listing" ? "directionSwap" : "directionOne", { from: name(r.fromId), to: name(r.toId) }),
              detail: detail(r),
            },
          }))}
        />
      )}
    </div>
  );
}
