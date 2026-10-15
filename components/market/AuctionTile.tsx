"use client";

import { useTranslations } from "next-intl";
import { Fuda } from "@/components/fuda/Fuda";
import { Link } from "@/i18n/navigation";
import type { AuctionListItem } from "@/server/market/queries";
import { ZeniCoin } from "../layout/ZeniCoin";
import { Countdown } from "./Countdown";

/** Une vente dans la liste du marché : fuda, prix, mises, fin et badges (à toi, en tête, immédiat). */
export function AuctionTile({ item, serverNow, preload }: { item: AuctionListItem; serverNow: number; preload: boolean }) {
  const t = useTranslations("market");
  const open = item.status === "ACTIVE";
  return (
    <Link
      href={`/marche/${item.id}`}
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-2 transition-transform active:scale-[0.98] motion-reduce:transition-none"
    >
      <Fuda card={item.card} series={item.card.series} size="sm" preload={preload} monochrome={!open && item.status !== "SOLD"} />
      <div className="flex min-w-0 flex-col gap-0.5 px-0.5">
        {(item.mine || (item.leading && open) || item.buyoutPrice !== null) && (
          <div className="flex flex-wrap gap-1">
            {item.mine && <span className="rounded-sm bg-ai px-1 text-[10px] font-bold text-bg">{t("mine")}</span>}
            {item.leading && open && <span className="rounded-sm bg-kin px-1 text-[10px] font-bold text-sumi">{t("leading")}</span>}
            {item.buyoutPrice !== null && (
              <span className="rounded-sm bg-shu-btn px-1 text-[10px] font-bold text-washi-paper">{t("buyoutBadge")}</span>
            )}
          </div>
        )}
        <p className="truncate text-sm font-bold">{item.card.name}</p>
        <p className="flex items-center gap-1">
          <ZeniCoin size={14} />
          <span className="font-bold tabular-nums text-kin">{t("zeni", { amount: item.price })}</span>
        </p>
        <p className="text-xs text-text-muted">{t("bids", { count: item.bidCount })}</p>
        <p className="text-xs text-text-muted">
          {open ? <Countdown endsAt={new Date(item.endsAt).getTime()} serverNow={serverNow} /> : t(`status.${item.status}`)}
        </p>
      </div>
    </Link>
  );
}
