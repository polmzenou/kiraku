import { getFormatter, getTranslations } from "next-intl/server";
import { mergeLotViews, type EnnichiView } from "@/server/ennichi/queries";
import { referralV2Rules } from "@/server/referral/deps";
import { LotGifts } from "../referral/LotGifts";
import { HelpButton, type HelpTopic } from "./HelpButton";
import { bgOf, Street, themedBg } from "./parts";

/** « ? » d'une partie de la fête : les phrases avec les réglages en vigueur (étape 2, paliers, rangs, cagnotte). */
export async function EnnichiHelp({ topic, view, className = "" }: { topic: HelpTopic; view: EnnichiView; className?: string }) {
  const [t, tPage, format, rules] = await Promise.all([getTranslations("ennichi.help"), getTranslations("ennichi.page"), getFormatter(), referralV2Rules()]);
  const hours = rules.installHours % 24 === 0 ? t("days", { count: rules.installHours / 24 }) : t("hours", { count: rules.installHours });
  const name = t(`${topic}.name`);
  const art =
    topic === "banzuke" ? (
      <div className="expl-art" style={bgOf("banzuke-papier", "cover", "50% 0%")} />
    ) : topic === "omikuji" ? (
      <div className="expl-art themed-bg" style={themedBg("sanctuaire")} />
    ) : (
      <Street litPhone={9} litDesk={15} className="expl-art" />
    );
  const allTiers = mergeLotViews(view.tiers.map((tier) => tier.lot));
  const allVouchers = view.tiers.reduce((sum, tier) => sum + tier.choiceVouchers, 0);
  const lines =
    topic === "lanternes"
      ? [
          t("lanternes.l1"),
          t("lanternes.l2", { openings: format.number(rules.installOpenings), hours }),
          <span key="l3">
            {t("lanternes.l3", { count: view.tiers.length })}
            {allTiers && <LotGifts lot={allTiers} compact className="mt-1.5" />}
            {allVouchers > 0 && <span className="mt-1 block text-xs font-bold">{tPage("vouchers", { count: allVouchers })}</span>}
          </span>,
        ]
      : topic === "banzuke"
        ? [t("banzuke.l1"), t("banzuke.l2"), t("banzuke.l3", { last: view.lastPaidRank })]
        : topic === "omikuji"
          ? [t("omikuji.l1"), t("omikuji.l2"), t("omikuji.l3")]
          : [t("fete.l1", { days: view.days, multiplier: view.multiplier }), t("fete.l2"), t("fete.l3")];
  return <HelpButton topic={topic} name={name} lines={lines} art={art} className={className} />;
}
