import { useTranslations } from "next-intl";
import type { RefereeProgress, ReferralRules } from "@/lib/economy/referral";

const HOUR = 3_600_000;

/** Les quatre conditions de qualification d'un filleul, cochées une à une, boosters en jauge. */
export function RefereeChecklist({ progress, rules, now }: { progress: RefereeProgress; rules: ReferralRules; now: Date }) {
  const t = useTranslations("economy.referral.check");
  const ageHours = Math.floor((now.getTime() - progress.createdAt.getTime()) / HOUR);
  const steps = [
    { key: "account", done: !progress.isGuest && !progress.bannedAt, label: t("account") },
    ...(rules.requireVerified ? [{ key: "verified", done: progress.verified, label: t("verified") }] : []),
    {
      key: "age",
      done: ageHours >= rules.minAccountAgeHours,
      label: t("age", { hours: Math.min(ageHours, rules.minAccountAgeHours), total: rules.minAccountAgeHours }),
    },
    {
      key: "boosters",
      done: progress.boostersOpened >= rules.minBoostersOpened,
      label: t("boosters", { count: Math.min(progress.boostersOpened, rules.minBoostersOpened), total: rules.minBoostersOpened }),
    },
  ];
  const ratio = rules.minBoostersOpened > 0 ? Math.min(1, progress.boostersOpened / rules.minBoostersOpened) : 1;

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-wrap gap-1.5">
        {steps.map((s) => (
          <li
            key={s.key}
            className={`inline-flex min-h-7 items-center gap-1 rounded-full border px-2 text-xs ${
              s.done ? "border-kin/60 bg-kin/10 text-kin" : "border-border text-text-muted"
            }`}
          >
            <span aria-hidden="true">{s.done ? "✓" : "○"}</span>
            <span className="sr-only">{s.done ? t("done") : t("todo")}</span>
            {s.label}
          </li>
        ))}
      </ul>
      <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full w-full origin-left rounded-full bg-ai" style={{ transform: `scaleX(${ratio})` }} />
      </div>
    </div>
  );
}
