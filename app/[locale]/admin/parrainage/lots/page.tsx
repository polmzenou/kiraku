import { getLocale, getTranslations } from "next-intl/server";
import { LotForm } from "@/components/admin/LotForm";
import { ReferralAdminTabs } from "@/components/admin/referral/ReferralAdminTabs";
import { LotRewards } from "@/components/economy/LotRewards";
import { Link } from "@/i18n/navigation";
import { canManageReferrals } from "@/lib/admin/roles";
import { localize, parseLocalized } from "@/lib/boosters/types";
import type { ReferralLotUsage } from "@/lib/referral/lots";
import { requireAdminView } from "@/server/admin";
import { prisma } from "@/server/db";
import { lotViews } from "@/server/economy/lot-view";
import { heldReferralCount } from "@/server/referral/admin-queries";
import { referralLotRows } from "@/server/referral/lots";

/**
 * Lots du parrainage et de l'Ennichi : ce que versent les étapes, les paliers, les lanternes, le banzuke et l'omikuji.
 * Toute l'équipe (ADMIN et DEV) en modifie le contenu, ou crée un lot à choisir ensuite dans les réglages. Un lot qui
 * sert aussi ailleurs se modifie dans /admin/lots, réservé à l'admin comme l'envoi d'un lot aux joueurs.
 */
export default async function AdminReferralLotsPage({ searchParams }: PageProps<"/[locale]/admin/parrainage/lots">) {
  const { user } = await requireAdminView();
  const canManage = canManageReferrals(user.role);
  const [t, tEconomy, locale, sp, held] = await Promise.all([
    getTranslations("admin.referralV2.lots"),
    getTranslations("admin.economy"),
    getLocale(),
    searchParams,
    heldReferralCount(),
  ]);
  const rows = await referralLotRows(prisma, locale);
  const editId = typeof sp.id === "string" ? sp.id : null;
  const editing = editId ? rows.find((r) => r.id === editId && r.access === "EDITABLE") : undefined;
  const cardIds = editing?.input.items.flatMap((i) => (i.kind === "CARD" ? [i.cardId] : [])) ?? [];
  const [views, types, cards] = await Promise.all([
    lotViews(
      rows.map((r) => r.id),
      locale,
    ),
    canManage ? prisma.boosterType.findMany({ orderBy: [{ family: "asc" }, { sortOrder: "asc" }], select: { id: true, name: true } }) : [],
    cardIds.length ? prisma.card.findMany({ where: { id: { in: cardIds } }, select: { id: true, name: true } }) : [],
  ]);

  const usage = (u: ReferralLotUsage) => {
    switch (u.kind) {
      case "V1_MILESTONE":
        return t("usage.V1_MILESTONE", { referrals: u.referrals });
      case "STEP":
        return t("usage.STEP", { step: String(u.step), side: u.side });
      case "MILESTONE":
        return t("usage.MILESTONE", { installed: u.installed });
      case "TIER":
        return t("usage.TIER", { tier: u.tier });
      case "RANK":
        return t("usage.RANK", { count: u.to - u.from + 1, range: u.from === u.to ? String(u.from) : `${u.from}–${u.to}` });
      case "OMIKUJI":
        return t("usage.OMIKUJI", { line: u.line });
      default:
        return t(`usage.${u.kind}`);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <ReferralAdminTabs active="lots" held={held} />
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
      </div>

      {canManage && (
        <LotForm
          key={editing?.id ?? "new"}
          scope="referral"
          initial={editing?.input ?? null}
          boosterTypes={types.map((b) => ({ id: b.id, name: localize(parseLocalized(b.name), locale) }))}
          cardNames={Object.fromEntries(cards.map((c) => [c.id, c.name]))}
        />
      )}

      <section className="flex flex-col gap-3" aria-labelledby="lots-parrainage">
        <h3 id="lots-parrainage" className="font-title text-base font-bold">
          {t("listTitle", { count: rows.length })}
        </h3>
        {rows.length === 0 ? (
          <p className="lacquer rounded-card p-6 text-center text-sm text-text-muted">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((lot) => (
              <li key={lot.id} className="flex flex-col gap-2 lacquer rounded-card p-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <p className="font-bold">
                    {lot.name}
                    {!lot.active && <span className="ml-2 text-xs text-text-muted">{tEconomy("inactive")}</span>}
                  </p>
                  <LotRewards lot={views.get(lot.id)} />
                  <ul className="flex flex-wrap gap-1.5" aria-label={t("usedBy")}>
                    {lot.usages.length === 0 ? (
                      <li className="rounded-pill border border-border px-2 py-0.5 text-[11px] text-text-muted">{t("unused")}</li>
                    ) : (
                      lot.usages.map((u, i) => (
                        <li key={i} className="rounded-pill border border-border bg-surface px-2 py-0.5 text-[11px] font-bold text-text-muted">
                          {usage(u)}
                        </li>
                      ))
                    )}
                  </ul>
                  {lot.access === "LOT_SHARED" && <p className="text-xs text-text-muted">{t("shared")}</p>}
                </div>
                {canManage && lot.access === "EDITABLE" && (
                  <Link
                    href={{ pathname: "/admin/parrainage/lots", query: { id: lot.id } }}
                    className="inline-flex min-h-11 shrink-0 items-center text-sm text-link underline underline-offset-4"
                  >
                    {t("edit")}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
