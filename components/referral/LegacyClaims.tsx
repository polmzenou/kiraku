import { useTranslations } from "next-intl";
import type { LegacyClaim } from "@/server/referral/queries";
import { ClaimReferralButton } from "../economy/ClaimButton";
import { LotGifts } from "./LotGifts";

/** Ancien parrainage : les lots v1 encore à réclamer, un bouton chacun. */
export function LegacyClaims({ claims }: { claims: LegacyClaim[] }) {
  const t = useTranslations("referralV2.legacy");
  return (
    <section className="flex flex-col gap-3 lacquer rounded-card p-4" aria-labelledby="ancien">
      <div className="flex flex-col gap-0.5">
        <h2 id="ancien" className="font-title text-base font-bold">{t("title")}</h2>
        <p className="text-xs text-text-muted">{t("body")}</p>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {claims.map((c) => (
          <li key={c.referralId} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="flex min-w-0 flex-col gap-1">
              <b className="truncate text-sm">{c.name}</b>
              <LotGifts lot={c.lot} compact />
            </span>
            <ClaimReferralButton referralId={c.referralId} claimed={false} />
          </li>
        ))}
      </ul>
    </section>
  );
}
