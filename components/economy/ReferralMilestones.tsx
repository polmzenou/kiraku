import { useTranslations } from "next-intl";
import type { MilestoneState, MilestoneView } from "@/lib/economy/referral";
import { BADGE_KANJI } from "@/lib/profile/conditions";
import type { LotView } from "@/server/economy/lot-view";
import { BoosterArt } from "../boosters/BoosterArt";
import { ZeniCoin } from "../layout/ZeniCoin";
import { ClaimMilestoneButton } from "./ClaimButton";
import { LotRewards } from "./LotRewards";

const DOT: Record<MilestoneState, string> = {
  CLAIMED: "bg-kin text-sumi",
  READY: "bg-kin text-sumi ring-4 ring-kin/25",
  NEXT: "border-2 border-shu bg-bg text-text ring-4 ring-shu/20",
  LOCKED: "border border-border bg-surface-2 text-text-muted",
};
const TILE: Record<MilestoneState, string> = {
  CLAIMED: "border-kin/40 bg-surface",
  READY: "border-kin bg-kin/10 shadow-[0_0_18px_rgb(217_181_86/0.25)]",
  NEXT: "border-shu/60 bg-surface",
  LOCKED: "border-border bg-surface opacity-70",
};
const CHIP: Record<MilestoneState, string> = {
  CLAIMED: "text-text-muted",
  READY: "bg-kin text-sumi",
  NEXT: "bg-shu/15 text-shu",
  LOCKED: "bg-surface-2 text-text-muted",
};

/** Avancée de la barre entre la première et la dernière pastille (0 à 1). */
function railProgress(milestones: readonly MilestoneView[], qualified: number): number {
  const next = milestones.findIndex((m) => m.referrals > qualified);
  if (next === -1) return 1;
  if (next === 0 || milestones.length < 2) return 0;
  const from = milestones[next - 1].referrals;
  const step = (qualified - from) / (milestones[next].referrals - from);
  return (next - 1 + step) / (milestones.length - 1);
}

/** Vignette du lot d'un palier : son premier booster, sinon des Zeni ou une fuda. */
function MilestoneArt({ lot }: { lot: LotView | undefined }) {
  const booster = lot?.lines.find((l) => l.kind === "BOOSTER");
  if (booster?.kind === "BOOSTER") {
    return (
      <div className="relative w-full max-w-12 @container">
        <BoosterArt
          shape={booster.look.shape}
          theme={booster.look.theme}
          emblem={booster.look.emblem}
          name={booster.name}
          contents={booster.look.contents}
          compact
        />
        {booster.quantity > 1 && (
          <span className="absolute -top-1 -right-3 rounded-full border border-kin/60 bg-bg/90 px-1.5 text-[11px] font-bold text-kin tabular-nums">
            ×{booster.quantity}
          </span>
        )}
      </div>
    );
  }
  if (lot && lot.zeni > 0) return <ZeniCoin size={36} />;
  return (
    <span aria-hidden="true" lang="ja" className="font-seal text-3xl text-kin">
      札
    </span>
  );
}

/**
 * Paliers du parrain, en étapes sur une ligne : chaque ami qualifié (depuis toujours) avance la
 * barre, chaque palier atteint se réclame une fois. En dessous, ce que rapporte chaque filleul.
 */
export function ReferralMilestones({
  milestones,
  lots,
  qualified,
  recruiterReferrals,
  referrerLot,
  refereeLot,
  canClaim,
}: {
  milestones: readonly MilestoneView[];
  lots: ReadonlyMap<string, LotView>;
  qualified: number;
  /** Palier où s'ajoute le badge Recruteur (profile.recruiterReferrals, 0 = aucun). */
  recruiterReferrals: number;
  referrerLot: LotView | undefined;
  refereeLot: LotView | undefined;
  /** Invité : aperçu seulement, sans bouton. */
  canClaim: boolean;
}) {
  const t = useTranslations("economy.referral");
  const tm = useTranslations("economy.referral.milestones");
  const tBadge = useTranslations("profile.customize.badgeNames");
  const lotName = (m: MilestoneView) => lots.get(m.lotId)?.name ?? "";

  const ready = milestones.find((m) => m.state === "READY");
  const next = milestones.find((m) => m.state === "NEXT");
  // Une fois versé, le bouton du dernier palier réclamé reste monté pour garder le message de récompense
  const lastClaimed = milestones.findLast((m) => m.state === "CLAIMED");
  const button = ready ?? lastClaimed;
  const edge = milestones.length > 0 ? `${50 / milestones.length}%` : "0";
  const progress = railProgress(milestones, qualified);

  return (
    <section aria-labelledby="paliers" className="flex flex-col gap-4 lacquer rounded-card p-5">
      <div className="flex flex-col gap-1">
        <h2 id="paliers" className="font-heading text-xl font-bold">
          {tm("title")}
        </h2>
        <p className="text-sm text-text-muted">{tm("body")}</p>
      </div>

      {milestones.length === 0 ? (
        <p className="text-sm text-text-muted">{tm("empty")}</p>
      ) : (
        <>
          <ol className="relative grid gap-2" style={{ gridTemplateColumns: `repeat(${milestones.length}, minmax(0, 1fr))` }}>
            {/* Rail d'une pastille à l'autre, rempli par les amis qualifiés */}
            <span aria-hidden="true" className="absolute top-4.25 h-0.5 rounded-full bg-border" style={{ left: edge, right: edge }} />
            <span aria-hidden="true" className="absolute top-4.25 h-0.5" style={{ left: edge, right: edge }}>
              <span
                className="block h-full w-full origin-left rounded-full bg-kin motion-safe:transition-transform motion-safe:duration-700"
                style={{ transform: `scaleX(${progress})` }}
              />
            </span>
            {milestones.map((m) => (
              <li key={m.referrals} className="relative flex flex-col items-center gap-2 text-center">
                <span
                  className={`relative flex size-9 items-center justify-center rounded-full text-sm font-bold tabular-nums ${DOT[m.state]}`}
                  aria-hidden="true"
                >
                  {m.referrals}
                </span>
                <div className={`flex w-full flex-1 flex-col items-center gap-1.5 rounded-control border px-1 py-2 ${TILE[m.state]}`}>
                  <MilestoneArt lot={lots.get(m.lotId)} />
                  <p className="text-[11px] font-bold tracking-wide text-kin uppercase">{tm("friends", { count: m.referrals })}</p>
                  <p className="text-xs leading-tight font-bold">{lotName(m)}</p>
                  {recruiterReferrals > 0 && m.referrals === recruiterReferrals && (
                    <p className="text-[11px] leading-tight text-kin">
                      <span aria-hidden="true" lang="ja" className="font-seal">
                        {BADGE_KANJI.RECRUITER}
                      </span>{" "}
                      {tm("badge", { name: tBadge("RECRUITER") })}
                    </p>
                  )}
                  <span className={`mt-auto rounded-full px-1.5 py-0.5 text-[11px] font-bold ${CHIP[m.state]}`}>
                    {m.state === "CLAIMED" && (
                      <span aria-hidden="true" lang="ja" className="font-seal text-shu">
                        済{" "}
                      </span>
                    )}
                    {tm(`state.${m.state}`, { remaining: m.remaining })}
                  </span>
                </div>
              </li>
            ))}
          </ol>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className={`text-sm ${ready && canClaim ? "font-bold text-kin" : "text-text-muted"}`}>
              {ready && canClaim
                ? tm("ready", { count: ready.referrals, name: lotName(ready) })
                : next
                  ? tm("progress", { qualified, remaining: next.remaining, name: lotName(next) })
                  : milestones.every((m) => m.state === "CLAIMED")
                    ? tm("allDone")
                    : null}
            </p>
            {canClaim && button && (
              <ClaimMilestoneButton key={button.referrals} referrals={button.referrals} claimed={button !== ready} label={tm("claim")} />
            )}
          </div>
        </>
      )}

      <div className="flex flex-col gap-2 border-t border-dashed border-border pt-3">
        <p className="text-xs font-bold tracking-wide text-text-muted uppercase">{tm("perReferral")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { title: t("rewardReferrer"), lot: referrerLot },
            { title: t("rewardReferee"), lot: refereeLot },
          ].map(({ title, lot }) => (
            <div key={title} className="flex flex-col gap-1.5">
              <p className="text-sm font-bold">{title}</p>
              {lot ? <LotRewards lot={lot} /> : <p className="text-sm text-text-muted">{t("noReward")}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
