import { useTranslations } from "next-intl";
import type { RewardSummary } from "@/server/actions/economy";

/** « Reçu : 100 Zeni · 2 boosters · 1 carte » (seulement ce que le lot contenait). */
export function RewardText({ reward }: { reward: RewardSummary }) {
  const t = useTranslations("economy.reward");
  const parts = [
    reward.zeni > 0 ? t("zeni", { amount: reward.zeni }) : null,
    reward.boosters > 0 ? t("boosters", { count: reward.boosters }) : null,
    reward.cards.length > 0 ? t("cards", { count: reward.cards.length }) : null,
  ].filter((p): p is string => p !== null);
  return <>{t("received", { list: parts.join(" · ") || t("nothing") })}</>;
}
