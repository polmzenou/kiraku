import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { VoucherGroup } from "@/lib/referral/vouchers";
import { buttonClasses } from "../ui/Button";
import { VoucherTicket } from "./VoucherTicket";

/** Bandeau « Tu as un bon à utiliser » des pages du parrainage : mène au choix de la carte. Rien sans bon. */
export async function VoucherBanner({ groups }: { groups: readonly VoucherGroup[] }) {
  if (groups.length === 0) return null;
  const [t, format] = await Promise.all([getTranslations("referralV2.vouchers"), getFormatter()]);
  const count = groups.reduce((sum, g) => sum + g.count, 0);
  const what = format.list(groups.map((g) => t(`kindCount.${g.kind}`, { count: g.count })), { type: "conjunction" });
  return (
    <Link
      href="/parrainage/bons"
      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 lacquer rounded-card border-kin/55 p-3.5 text-text transition-transform active:scale-[.99] motion-reduce:transition-none"
    >
      <VoucherTicket kind={groups[0].kind} width={46} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <b className="text-sm">{t("banner.title", { count })}</b>
        <span className="text-xs text-text-muted">{t("banner.body", { what })}</span>
      </span>
      <span aria-hidden="true" className={buttonClasses("primary", "", "sm")}>
        {t("banner.cta")}
      </span>
    </Link>
  );
}
