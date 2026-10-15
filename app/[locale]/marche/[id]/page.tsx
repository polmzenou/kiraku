import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Fuda } from "@/components/fuda/Fuda";
import { FudaTurnover } from "@/components/fuda/FudaTurnover";
import { GuestBootstrap } from "@/components/GuestBootstrap";
import { AuctionPanel, type TradeBlock } from "@/components/market/AuctionPanel";
import { PageShell } from "@/components/PageShell";
import { Link } from "@/i18n/navigation";
import { RARITY_SEAL } from "@/lib/catalog/rarity";
import { checkTrader } from "@/lib/market/rules";
import { prisma } from "@/server/db";
import { getAuctionDetail, getMarketRules } from "@/server/market/queries";
import { getSetting } from "@/server/settings";
import { getCurrentUser } from "@/server/user";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const idSchema = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);

/** Fiche d'une vente : carte, prix en direct, mise, achat immédiat et dernières mises. */
export default async function AuctionPage({ params }: PageProps<"/[locale]/marche/[id]">) {
  const { id: raw } = await params;
  const id = idSchema.safeParse(raw);
  if (!id.success) notFound();
  const [t, tRarity, format, user, locale] = await Promise.all([
    getTranslations("market"),
    getTranslations("rarity"),
    getFormatter(),
    getCurrentUser(),
    getLocale(),
  ]);
  if (!user) {
    return (
      <PageShell>
        <GuestBootstrap />
      </PageShell>
    );
  }

  const now = new Date();
  const [detail, rules, pollSeconds, account] = await Promise.all([
    getAuctionDetail(id.data, user.id, locale, now),
    getMarketRules(),
    getSetting("market.pollSeconds"),
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { createdAt: true } }),
  ]);
  if (!detail) notFound();
  const refusal = checkTrader({ isGuest: user.isGuest, bannedAt: user.bannedAt, createdAt: account.createdAt }, now, rules);
  const block: TradeBlock = refusal;

  return (
    <PageShell>
      <Link href="/marche" className="inline-flex min-h-11 w-fit items-center text-link underline underline-offset-4">
        {t("detail.back")}
      </Link>
      <article className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
        <FudaTurnover className="mx-auto w-full max-w-[200px] md:mx-0 md:w-[300px] md:max-w-none md:shrink-0">
          <Fuda card={detail.card} series={detail.card.series} size="lg" preload />
        </FudaTurnover>

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <header className="flex flex-col gap-1">
            <p className="text-sm text-text-muted">
              <span aria-hidden="true" className="font-seal">
                {RARITY_SEAL[detail.card.rarity]}
              </span>{" "}
              {tRarity(detail.card.rarity)} · {t(`status.${detail.live.status}`)}
            </p>
            <h1 className="text-2xl font-extrabold md:text-3xl">{detail.card.name}</h1>
            <p className="text-sm text-text-muted">{detail.card.series}</p>
            <p className="text-sm">{t("detail.seller", { name: detail.sellerName })}</p>
          </header>

          <AuctionPanel
            auctionId={detail.id}
            initial={detail.live}
            feeBp={detail.feeBp}
            mine={detail.mine}
            coins={user.coins}
            block={block}
            pollSeconds={pollSeconds}
            serverNow={now.getTime()}
            rules={{
              increment: rules.minIncrementBp / 100,
              window: Math.round(rules.antiSnipeSeconds / 60),
              extend: Math.round(rules.extendSeconds / 60),
              fee: detail.feeBp / 100,
            }}
          />

          <section className="flex flex-col gap-2">
            <h2 className="font-title text-lg font-bold">{t("detail.history")}</h2>
            {detail.bids.length === 0 ? (
              <p className="text-sm text-text-muted">{t("detail.historyEmpty")}</p>
            ) : (
              <ol className="flex flex-col gap-1 text-sm">
                {detail.bids.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2 rounded-button border border-border bg-surface px-3 py-2">
                    <span className="min-w-0 truncate">
                      {b.me ? <strong>{t("detail.you")}</strong> : b.bidderName}
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="font-bold tabular-nums text-kin">{t("zeni", { amount: b.amount })}</span>
                      <time dateTime={b.createdAt.toISOString()} className="text-xs text-text-muted">
                        {format.relativeTime(b.createdAt, now)}
                      </time>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </article>
    </PageShell>
  );
}
