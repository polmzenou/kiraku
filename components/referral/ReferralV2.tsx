import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import type { ReferralV2Rules } from "@/lib/referral/rules";
import type { LastReward, ReferralV2View, StepGifts } from "@/server/referral/queries";
import { ReferralCodeForm } from "../economy/ReferralCodeForm";
import { ReferralShare } from "../economy/ReferralShare";
import { ButtonLink } from "../ui/ButtonLink";
import { LotGifts } from "./LotGifts";
import { RefereeTable } from "./RefereeTable";
import { ReferralLadder } from "./ReferralLadder";
import { SelfStairs } from "./SelfStairs";
import { StepCards } from "./StepCards";
import type { StepConditions } from "./step-meta";
import { ThemedArt } from "./ThemedArt";
import { VoucherBanner } from "./VoucherBanner";

// Page /parrainage du parrainage v2 (étape 18), selon le joueur (designs validés de l'atelier 1) :
//   - filleul v2 : « Bienvenue d'abord » (ses étapes en marches, le verrou de ses cartes, son parrain) ;
//   - avec des filleuls : « Tableau » (compteurs, filleuls et leurs nœuds, dernier cadeau, lien, paliers) ;
//   - sans filleul : « Fuda à retourner » (bandeau, ce que vous gagnez, lien, paliers, règles).

export function stepConditions(rules: ReferralV2Rules): StepConditions {
  return {
    openings: rules.installOpenings,
    installDays: Math.max(1, Math.round(rules.installHours / 24)),
    accroDays: rules.accroDays,
    accroWindow: rules.accroWindowDays,
    fideleDays: rules.fideleDays,
    fideleWindow: rules.fideleWindowDays,
  };
}

function Seal({ kanji }: { kanji: string }) {
  return (
    <span aria-hidden="true" lang="ja" className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-shu-btn font-seal text-xl text-washi-paper">
      {kanji}
    </span>
  );
}

/** Bandeau : l'illustration du thème et de l'appareil, le titre, une phrase. */
async function Hero() {
  const t = await getTranslations("referralV2");
  return (
    <section className="relative isolate flex min-h-48 flex-col justify-end gap-1 overflow-hidden rounded-card border border-border p-5 md:min-h-56">
      <ThemedArt base="hero" sizes="(min-width: 768px) 1100px, 100vw" priority className="-z-20" />
      <span aria-hidden="true" className="absolute inset-0 -z-10 bg-linear-to-t from-bg/85 via-bg/30 to-transparent" />
      <div className="flex items-center gap-3">
        <Seal kanji="招" />
        <h1 className="font-heading text-2xl">{t("title")}</h1>
      </div>
      <p className="max-w-md text-sm">{t("lead")}</p>
    </section>
  );
}

async function LinkCard({ code }: { code: string }) {
  const t = await getTranslations("referralV2.link");
  return (
    <section className="flex flex-col gap-2 lacquer rounded-card p-4" aria-labelledby="lien">
      {/* Titre pour les lecteurs d'écran : ReferralShare affiche déjà « Ton code » */}
      <h2 id="lien" className="sr-only">{t("title")}</h2>
      <ReferralShare code={code} />
      <p className="text-xs text-text-muted">{t("hint")}</p>
    </section>
  );
}

async function Rules({ rules }: { rules: ReferralV2Rules }) {
  const t = await getTranslations("referralV2.rules");
  return (
    <details className="lacquer rounded-card px-4 py-1 text-sm">
      <summary className="flex min-h-11 cursor-pointer items-center font-bold">{t("title")}</summary>
      <ol className="mb-3 flex list-decimal flex-col gap-1 pl-5 text-text-muted">
        <li>{t("once")}</li>
        <li>{t("lock", { days: rules.cardLockDays })}</li>
        <li>{t("device")}</li>
        <li>{t("cheat")}</li>
      </ol>
    </details>
  );
}

async function StepsSection({ steps, conditions }: { steps: StepGifts[]; conditions: StepConditions }) {
  const t = await getTranslations("referralV2.steps");
  return (
    <section className="flex flex-col gap-3" aria-labelledby="gains">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="gains" className="font-title text-lg font-bold">{t("title")}</h2>
        <span className="text-xs text-text-muted">{t("tapAny")}</span>
      </div>
      <StepCards steps={steps} conditions={conditions} />
    </section>
  );
}

/** Dernier cadeau reçu du parrainage, avec ce qu'il contenait. */
async function LastGift({ reward, now }: { reward: LastReward; now: Date }) {
  const [t, tSteps, format] = await Promise.all([getTranslations("referralV2.last"), getTranslations("referralV2.steps"), getFormatter()]);
  const step = Math.min(4, Math.max(1, reward.step ?? 1)) as 1 | 2 | 3 | 4;
  return (
    <section className="flex flex-col gap-2 lacquer rounded-card p-4" aria-labelledby="recu">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="recu" className="font-title text-base font-bold">{t("title")}</h2>
        <span className="text-xs text-text-muted">{format.relativeTime(new Date(reward.at), now)}</span>
      </div>
      <p className="text-sm">
        {t("what", {
          kind: reward.kind,
          side: reward.side ?? "NONE",
          step: String(step),
          stepName: tSteps(`${step}.name`),
          milestone: reward.milestone ?? 0,
          name: reward.actor ?? "",
        })}
      </p>
      <LotGifts lot={reward.lot} compact />
    </section>
  );
}

const grid = (left: ReactNode, right: ReactNode) => (
  <div className="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-start">
    <div className="flex min-w-0 flex-col gap-4">{left}</div>
    <div className="flex min-w-0 flex-col gap-4">{right}</div>
  </div>
);

/** Invité : ce que rapporte le parrainage, et l'inscription d'abord. */
export async function ReferralV2Guest({ steps, rules, invited }: { steps: StepGifts[]; rules: ReferralV2Rules; invited: boolean }) {
  const [t, tAccount] = await Promise.all([getTranslations("referralV2.guest"), getTranslations("account")]);
  return (
    <>
      <Hero />
      <section className="flex flex-col gap-3 rounded-card border border-kin/60 bg-[linear-gradient(135deg,var(--color-surface),var(--color-surface-2))] p-5">
        <p className="font-title text-lg font-bold">{t(invited ? "invited" : "body")}</p>
        <ButtonLink href="/inscription" variant="primary" className="self-start">
          {tAccount("createAccount")}
        </ButtonLink>
      </section>
      <StepsSection steps={steps} conditions={stepConditions(rules)} />
    </>
  );
}

/** Page du parrainage v2 d'un joueur inscrit. `cookieCode` : code du lien d'invitation suivi sur cet appareil. */
export async function ReferralV2({
  view,
  rules,
  timeZone,
  now,
  cookieCode,
}: {
  view: ReferralV2View;
  rules: ReferralV2Rules;
  timeZone: string;
  now: Date;
  cookieCode: string | null;
}) {
  const [t, format] = await Promise.all([getTranslations("referralV2"), getFormatter()]);
  const conditions = stepConditions(rules);
  const last = view.lastReward && <LastGift reward={view.lastReward} now={now} />;
  const attach = view.canAttach && (
    <section className="lacquer rounded-card p-4">
      <ReferralCodeForm initialCode={cookieCode ?? ""} />
    </section>
  );
  const table = view.referees.length > 0 && <RefereeTable rows={view.referees} totals={view.totals} conditions={conditions} timeZone={timeZone} />;
  const vouchers = <VoucherBanner groups={view.vouchers} />;

  if (view.self) {
    const self = view.self;
    return grid(
      <>
        <div className="flex items-center gap-3">
          <Seal kanji="縁" />
          <div className="min-w-0">
            <h1 className="font-heading text-2xl">{t("self.welcome")}</h1>
            <p className="text-sm text-text-muted">{t("self.invitedBy", { name: self.referrer.name })}</p>
          </div>
        </div>
        {vouchers}
        <SelfStairs self={self} steps={view.steps} conditions={conditions} timeZone={timeZone} />
      </>,
      <>
        {self.cardLockUntil && (
          <section className="flex gap-3 rounded-card border border-ai/50 bg-ai/10 p-4 text-sm">
            <span aria-hidden="true" lang="ja" className="font-seal text-2xl text-ai">守</span>
            <p>
              <b>{t("self.lock", { date: format.dateTime(new Date(self.cardLockUntil), { day: "numeric", month: "long", timeZone }) })}</b>
              <br />
              <span className="text-text-muted">{t("self.lockBody", { days: rules.cardLockDays })}</span>
            </p>
          </section>
        )}
        <section className="flex flex-col gap-1 lacquer rounded-card p-4">
          <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{t("self.referrer")}</span>
          <p className="text-base font-bold">{self.referrer.name}</p>
          <p className="text-xs text-text-muted">{t("self.referrerBody")}</p>
        </section>
        {last}
        <section className="flex flex-col gap-2 lacquer rounded-card p-4">
          <h2 className="font-title text-base font-bold">{t("self.inviteTitle")}</h2>
          <p className="text-xs text-text-muted">{t("self.inviteBody")}</p>
          <ReferralShare code={view.code} />
        </section>
        {table && (
          <>
            <h2 className="font-title text-lg font-bold">{t("self.refereesTitle", { count: view.referees.length })}</h2>
            {table}
          </>
        )}
      </>,
    );
  }

  if (table) {
    return (
      <>
        <div className="flex items-center gap-3">
          <Seal kanji="招" />
          <h1 className="font-heading text-2xl">{t("title")}</h1>
        </div>
        {grid(
          <>
            {vouchers}
            {table}
            {last}
            <LinkCard code={view.code} />
          </>,
          <>
            {attach}
            <ReferralLadder ladder={view.ladder} installed={view.installed} />
            <Rules rules={rules} />
          </>,
        )}
      </>
    );
  }

  return (
    <>
      <Hero />
      {grid(
        <>
          {vouchers}
          <StepsSection steps={view.steps} conditions={conditions} />
          {last}
        </>,
        <>
          <LinkCard code={view.code} />
          {attach}
          <ReferralLadder ladder={view.ladder} installed={view.installed} limit={3} hint />
          <Rules rules={rules} />
        </>,
      )}
    </>
  );
}
