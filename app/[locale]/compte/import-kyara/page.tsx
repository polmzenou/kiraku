import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Fuda } from "@/components/fuda/Fuda";
import { GuestBootstrap } from "@/components/GuestBootstrap";
import { KyaraCancelButton } from "@/components/kyara/KyaraCancelButton";
import { KyaraRequestForm } from "@/components/kyara/KyaraRequestForm";
import { PageShell } from "@/components/PageShell";
import { SectionTitle } from "@/components/SectionTitle";
import { Button } from "@/components/ui/Button";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Link } from "@/i18n/navigation";
import type { CardView } from "@/lib/boosters/view";
import { KYARA_BASE_RARITY, KYARA_CODES, KYARA_SEAL } from "@/lib/kyara/codes";
import { kyaraProfileUrl } from "@/lib/kyara/profile-url";
import { CONVERTED_KINDS } from "@/lib/kyara/summary";
import { linkDiscord } from "@/server/actions/auth";
import { cardViews } from "@/server/boosters/display";
import { getRarityDefinitions } from "@/server/catalog/rarities";
import { discordEnabled } from "@/server/env";
import { playerKyaraView } from "@/server/kyara/queries";
import { getCurrentUser } from "@/server/user";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const PAGE = "/compte/import-kyara";

/**
 * Import Kyara (étape 17) : une seule demande, dans la fenêtre, sans rien coller ; le joueur ajoute le compte Kiraku
 * en ami sur Kyara, l'équipe y lit sa collection et elle est versée aussitôt. Un panneau par phase (lib/kyara/phase.ts).
 */
export default async function KyaraImportPage() {
  const [t, tRarity, format, user, locale] = await Promise.all([
    getTranslations("kyaraImport"),
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

  const { phase, rules, request } = await playerKyaraView(user, new Date());
  if (phase.kind === "HIDDEN") notFound();
  const date = (at: number | Date | null) => (at === null ? "" : format.dateTime(new Date(at), { dateStyle: "long", timeStyle: "short" }));
  const staffUrl = rules.staffKyaraUserId ? kyaraProfileUrl(rules.staffKyaraUserId) : null;
  const summary = phase.kind === "DONE" ? (request?.summary ?? null) : null;
  const [top, definitions] = summary
    ? await Promise.all([cardViews(summary.top, locale), getRarityDefinitions()])
    : [new Map<string, CardView>(), []];

  const discordForm = discordEnabled ? (
    <form action={linkDiscord}>
      <input type="hidden" name="redirectTo" value={PAGE} />
      <Button type="submit" variant="primary" className="w-full sm:w-fit">
        {t("closed.linkDiscord")}
      </Button>
    </form>
  ) : null;

  const staffLink = staffUrl && (
    <a href={staffUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-ai underline underline-offset-4">
      {t("steps.staffProfile")}
    </a>
  );

  const steps = (
    <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
      <li>{t("steps.one")}</li>
      <li>
        {t("steps.two")} {staffLink}
      </li>
      <li>{t("steps.share")}</li>
      <li>{t("steps.three")}</li>
    </ol>
  );

  const rulesBlock = (
    <section className="flex flex-col gap-2 text-sm" aria-labelledby="kyara-rules">
      <h2 id="kyara-rules" className="font-title text-lg font-bold">
        {t("rules.title")}
      </h2>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-text-muted">
        <li>{t("rules.card")}</li>
        <li>{t("rules.cap")}</li>
        <li>{t("rules.owned")}</li>
        <li>
          {t("rules.missing")}
          <ul className="mt-1 grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            {KYARA_CODES.map((code) => (
              <li key={code} className="tabular-nums">
                {t("rules.scale", { rarity: tRarity(KYARA_BASE_RARITY[code]), code, zeni: rules.zeniByCode[code] })}
              </li>
            ))}
          </ul>
        </li>
        <li>{t("rules.zeniCap", { cap: rules.zeniCap })}</li>
        <li>{t("rules.once")}</li>
      </ul>
    </section>
  );

  let panel: ReactNode;
  switch (phase.kind) {
    case "SOON":
      panel = <p>{phase.opensAt !== null ? t("soonDated", { date: date(phase.opensAt) }) : t("soon")}</p>;
      break;
    case "GUEST":
      panel = (
        <>
          <h2 className="font-title text-lg font-bold">{t("guest.title")}</h2>
          <p className="text-sm text-text-muted">{t("guest.body", { days: rules.windowDays })}</p>
          <div className="flex flex-wrap gap-2">
            {discordForm}
            <ButtonLink href="/inscription">{t("guest.register")}</ButtonLink>
          </div>
        </>
      );
      break;
    case "CLOSED":
      panel = (
        <>
          <p>{t(`closed.${phase.reason}`, { date: date(phase.deadline) })}</p>
          {phase.reason === "NO_DISCORD" && discordForm}
        </>
      );
      break;
    case "OPEN":
      panel = (
        <>
          {phase.deadline !== null && <p className="text-sm font-bold text-kin">{t("deadline", { date: date(phase.deadline) })}</p>}
          {steps}
          <KyaraRequestForm />
        </>
      );
      break;
    case "PENDING":
      panel = (
        <>
          <h2 className="font-title text-lg font-bold">{t("pending.title")}</h2>
          <p className="text-sm">
            {t("pending.body")} {staffLink}
          </p>
          <p className="text-sm text-text-muted">{t("pending.sameDiscord")}</p>
          {request && <p className="text-xs text-text-muted">{t("pending.requested", { date: date(request.requestedAt) })}</p>}
          {request && <KyaraCancelButton importId={request.id} />}
        </>
      );
      break;
    case "READY":
      panel = (
        <>
          <h2 className="font-title text-lg font-bold">{t("ready.title")}</h2>
          <p className="text-sm">{t("ready.body")}</p>
        </>
      );
      break;
    case "REJECTED":
      panel = (
        <>
          <h2 className="font-title text-lg font-bold">{t("rejected.title")}</h2>
          <p className="text-sm">{t("rejected.reason", { reason: phase.code ?? "OTHER" })}</p>
          {request?.rejectNote && <p className="text-sm text-text-muted">{t("rejected.note", { note: request.rejectNote })}</p>}
          {phase.canRetry ? (
            <>
              {phase.deadline !== null && <p className="text-sm font-bold text-kin">{t("deadline", { date: date(phase.deadline) })}</p>}
              {steps}
              <KyaraRequestForm />
            </>
          ) : (
            <p className="text-sm text-text-muted">{t("rejected.noRetry")}</p>
          )}
        </>
      );
      break;
    case "DONE": {
      const sortOrder = new Map(definitions.map((d) => [d.key, d.sortOrder]));
      const byRarity = summary ? Object.entries(summary.byRarity).sort((a, b) => (sortOrder.get(b[0]) ?? 0) - (sortOrder.get(a[0]) ?? 0)) : [];
      const seals = new Map(definitions.map((d) => [d.key, d.seal]));
      panel = (
        <>
          <h2 className="font-title text-lg font-bold">{t("done.title")}</h2>
          <dl className="grid grid-cols-2 gap-2">
            <div className="rounded-control bg-surface-2 p-3">
              <dt className="text-xs text-text-muted">{t("done.cardsLabel")}</dt>
              <dd className="font-heading text-2xl tabular-nums">{format.number(request?.grantedCards ?? 0)}</dd>
            </div>
            <div className="rounded-control bg-surface-2 p-3">
              <dt className="text-xs text-text-muted">{t("done.zeniLabel")}</dt>
              <dd className="font-heading text-2xl tabular-nums text-kin">{format.number(request?.grantedZeni ?? 0)}</dd>
            </div>
          </dl>
          {summary?.capped && request?.zeniRaw != null && <p className="text-xs text-text-muted">{t("done.capped", { raw: request.zeniRaw })}</p>}
          {byRarity.length > 0 && (
            <ul className="flex flex-wrap gap-2 text-sm">
              {byRarity.map(([rarity, count]) => (
                <li key={rarity} className="inline-flex min-h-9 items-center gap-1.5 rounded-pill border border-border px-3">
                  <span aria-hidden="true" lang="ja" className="font-seal">
                    {seals.get(rarity) ?? ""}
                  </span>
                  {t("done.rarityCount", { rarity: tRarity(rarity as "COMMON"), count })}
                </li>
              ))}
            </ul>
          )}
          {summary && (
            <ul className="flex flex-col gap-1 text-sm text-text-muted">
              {CONVERTED_KINDS.filter((k) => summary.byKind[k].count > 0).map((k) => (
                <li key={k}>{t(`done.kind.${k}`, { count: summary.byKind[k].count, zeni: summary.byKind[k].zeni })}</li>
              ))}
              {summary.extraCopies > 0 && <li>{t("done.extraCopies", { count: summary.extraCopies })}</li>}
            </ul>
          )}
          {top.size > 0 && (
            <section className="flex flex-col gap-2" aria-labelledby="kyara-top">
              <h3 id="kyara-top" className="font-title font-bold">
                {t("done.top")}
              </h3>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {summary!.top.flatMap((id) => {
                  const card = top.get(id);
                  return card
                    ? [
                        <li key={id}>
                          <Link href={`/collection/${card.anilistId}`} aria-label={card.name} className="block rounded-fuda">
                            <Fuda card={card} series={card.series} size="sm" still />
                          </Link>
                        </li>,
                      ]
                    : [];
                })}
              </ul>
            </section>
          )}
          <ButtonLink href="/collection" variant="primary" className="w-full sm:w-fit">
            {t("done.collection")}
          </ButtonLink>
        </>
      );
      break;
    }
  }

  return (
    <PageShell>
      <SectionTitle level={1} kanji={KYARA_SEAL} title={t("title")} subtitle={t("intro")} />
      <section className="flex flex-col gap-4 lacquer rounded-card p-4 sm:p-5">{panel}</section>
      {(phase.kind === "OPEN" || phase.kind === "PENDING" || (phase.kind === "REJECTED" && phase.canRetry)) && rulesBlock}
      <p className="text-xs text-text-muted">{t("notAffiliated")}</p>
    </PageShell>
  );
}
