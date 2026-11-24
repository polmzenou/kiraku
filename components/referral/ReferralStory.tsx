import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import type { LotView } from "@/server/economy/lot-view";
import { ennichiView } from "@/server/ennichi/queries";
import { referralV2Rules } from "@/server/referral/deps";
import { referralGifts, referrerMonthTotal } from "@/server/referral/queries";
import { LotGifts } from "./LotGifts";
import { RungGifts } from "./ReferralLadder";
import { STEP_KANJI, stepConditions, stepNo } from "./step-meta";
import { ReferralStoryAnnouncement, ReferralStoryButton } from "./StoryDialog";

function Seal({ kanji, size = "size-8 text-base" }: { kanji: string; size?: string }) {
  return (
    <span aria-hidden="true" lang="ja" className={`flex shrink-0 items-center justify-center rounded-sm bg-shu-btn font-seal text-washi-paper ${size}`}>
      {kanji}
    </span>
  );
}

const Eyebrow = ({ children }: { children: ReactNode }) => <span className="text-[11px] font-bold tracking-wide text-text-muted uppercase">{children}</span>;
const Title = ({ children }: { children: ReactNode }) => (
  <h2 tabIndex={-1} className="font-heading text-[22px] leading-tight outline-none">
    {children}
  </h2>
);
const Chip = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex items-center rounded-pill bg-shu-btn px-2 py-0.5 font-body text-[11.5px] font-bold text-washi-paper">{children}</span>
);

/** « Toi » et « Ton ami » : ce que chacun reçoit à une étape, en images avec leur nombre. */
async function WhoRows({ you, friend, multiplier }: { you: LotView | null; friend: LotView | null; multiplier: number }) {
  const t = await getTranslations("referralV2.steps");
  const row = (who: string, lot: LotView | null) => (
    <div className="grid grid-cols-[56px_minmax(0,1fr)] items-start gap-2">
      <span className="pt-1 text-[11.5px] font-bold text-text-muted">{who}</span>
      <LotGifts lot={lot} multiplier={multiplier} compact />
    </div>
  );
  return (
    <div className="grid gap-1.5">
      {row(t("you"), you)}
      {row(t("friend"), friend)}
    </div>
  );
}

/**
 * Les écrans du parrainage (design « Enveloppe ») : ce qui change, les quatre étapes des deux côtés et le total d'un
 * mois, les paliers, puis l'Ennichi pendant la fête. Même contenu pour l'annonce du lancement (`announce`, une fois par
 * compte) et pour « Comment ça marche » (`how`, sur /parrainage). Les cadeaux viennent des réglages en vigueur.
 */
export async function ReferralStory(props: { mode: "announce"; userId: string; isGuest: boolean } | { mode: "how"; isGuest: boolean; className?: string }) {
  const locale = await getLocale();
  const rules = await referralV2Rules();
  const [t, tSteps, { steps, ladder }, fete] = await Promise.all([
    getTranslations("referralV2.story"),
    getTranslations("referralV2.steps"),
    referralGifts(rules, locale, 0),
    ennichiView(locale),
  ]);
  const conditions = stepConditions(rules);
  const live = fete.phase === "live";
  const m = live ? fete.multiplier : 1;
  const x = (i: number) => (i < 2 ? m : 1);
  const first = steps[0];
  const total = referrerMonthTotal(steps, m);
  const trust = steps.some((s) => s.trust !== null);

  const panes: ReactNode[] = [
    <div key="p1" className="flex flex-col gap-2.5">
      <Eyebrow>{t("new")}</Eyebrow>
      <Title>{t("p1.title")}</Title>
      <p className="text-[15px]">{t("p1.lead")}</p>
      {first && (
        <div className="flex flex-col gap-2 rounded-xl bg-surface p-3">
          <span className="flex flex-wrap items-center gap-2 font-title text-[15px] font-bold">
            <Seal kanji={STEP_KANJI[0]} size="size-6 text-sm" />
            {t("p1.step")}
            {m > 1 && <Chip>{t("x2Fete", { n: m })}</Chip>}
          </span>
          <WhoRows you={first.referrerTotal} friend={first.referee} multiplier={x(0)} />
        </div>
      )}
      <p className="text-xs text-text-muted">{t("p1.more")}</p>
    </div>,
    <div key="p2" className="flex flex-col gap-2.5">
      <Eyebrow>{t("p2.eyebrow", { count: steps.length })}</Eyebrow>
      <Title>{t("p2.title")}</Title>
      <ol className="flex flex-col gap-2.5">
        {steps.map((s, i) => (
          <li key={s.step} className="grid grid-cols-[30px_minmax(0,1fr)] items-start gap-2.5 border-b border-border pb-2.5 last:border-b-0 last:pb-0">
            <Seal kanji={STEP_KANJI[i] ?? String(i + 1)} size="size-7.5 text-base" />
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-sm">
                <b>{tSteps(`${stepNo(s.step)}.name`)}</b> · <span className="text-xs text-text-muted">{tSteps(`${stepNo(s.step)}.say`, conditions)}</span>
                {x(i) > 1 && (
                  <>
                    {" "}
                    <Chip>{t("x2", { n: x(i) })}</Chip>
                  </>
                )}
              </span>
              <WhoRows you={s.referrerTotal} friend={s.referee} multiplier={x(i)} />
            </div>
          </li>
        ))}
      </ol>
      {total && (
        <div className="flex flex-col gap-1.5 rounded-xl bg-surface p-3">
          <span className="text-xs text-text-muted">{t("p2.total")}</span>
          <LotGifts lot={total} compact />
        </div>
      )}
      {trust && <p className="text-xs text-text-muted">{t("p2.trust")}</p>}
    </div>,
    <div key="p3" className="flex flex-col gap-2.5">
      <Eyebrow>{t("p3.eyebrow")}</Eyebrow>
      <Title>{t("p3.title")}</Title>
      <p className="text-xs text-text-muted">{t("p3.lead")}</p>
      <ol className="flex flex-col gap-2">
        {ladder.map((r) => (
          <li key={r.installed} className="grid grid-cols-[34px_minmax(0,1fr)] items-center gap-2.5">
            <span className="flex size-8.5 items-center justify-center rounded-full border-[1.5px] border-kin text-[13px] font-bold text-kin tabular-nums">{r.installed}</span>
            <RungGifts rung={r} />
          </li>
        ))}
      </ol>
    </div>,
  ];
  if (live) {
    const day = fete.dayIndex ?? 1;
    panes.push(
      <div key="p4" className="flex flex-col gap-2.5">
        <Eyebrow>{day > 1 ? t("p4.day", { n: day, days: fete.days }) : t("p4.days", { days: fete.days })}</Eyebrow>
        <Title>{day > 1 ? t("p4.on") : t("p4.start")}</Title>
        <ul className="flex flex-col gap-2">
          {(
            [
              ["灯", "lanterns"],
              ["番", "banzuke"],
              ["籤", "omikuji"],
            ] as const
          ).map(([kanji, key]) => (
            <li key={key} className="grid grid-cols-[36px_minmax(0,1fr)] items-center gap-2.5 text-sm">
              <Seal kanji={kanji} size="size-8.5 text-lg" />
              <span>{t.rich(`p4.${key}`, { b: (chunks) => <b>{chunks}</b> })}</span>
            </li>
          ))}
        </ul>
        <span className="self-start">
          <Chip>{t("p4.x2", { n: m })}</Chip>
        </span>
      </div>,
    );
  }

  return props.mode === "announce" ? (
    <ReferralStoryAnnouncement userId={props.userId} panes={panes} canInvite={!props.isGuest} />
  ) : (
    <ReferralStoryButton panes={panes} canInvite={!props.isGuest} className={props.className} />
  );
}
