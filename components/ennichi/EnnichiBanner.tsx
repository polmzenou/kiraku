import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { streetLampsLit, tierProgress } from "@/lib/ennichi/rules";
import { prisma } from "@/server/db";
import { ennichiView, myAwards, type EnnichiView } from "@/server/ennichi/queries";
import { LotGifts } from "../referral/LotGifts";
import { buttonClasses } from "../ui/Button";
import { Countdown } from "./Countdown";
import { EnnichiHelp } from "./Help";
import { Lantern, Street, streetHooks } from "./parts";
import { Seal } from "./Seal";
// Seulement la petite feuille commune (bannière, explications, titres) : celle des pages de la fête reste sur /ennichi
import "./ennichi-base.css";

/** Échéance montrée par le compte à rebours : fin de la fête, puis clôture. */
export const countdownTarget = (view: EnnichiView) => (view.phase === "before" ? view.startsAt : view.phase === "live" ? view.endsAt : view.closesAt);

/** Lanternes allumées de la rue dessinée, pour chaque cadrage. */
export function streetLit(view: EnnichiView) {
  const tiers = view.tiers.map((t) => ({ lanterns: t.lanterns }));
  return { litPhone: streetLampsLit(view.lit, tiers, streetHooks.telephone), litDesk: streetLampsLit(view.lit, tiers, streetHooks.ordinateur) };
}

/**
 * Bannière de l'accueil pendant la fête (maquette « Rue des lanternes ») : la rue et ses lanternes allumées, le compte à
 * rebours, le prochain cadeau pour tous ; après le tirage, une version courte avec la place du joueur. Rien hors fête.
 */
export async function EnnichiBanner({ locale, userId }: { locale: string; userId: string | null }) {
  const view = await ennichiView(locale);
  if (view.phase === "off" || view.phase === "before") return null;
  const [t, format] = await Promise.all([getTranslations("ennichi"), getFormatter()]);
  const head = (sub: string) => (
    <div className="banner-h">
      <Seal kanji="祭" />
      <div className="min-w-0">
        <h3>{t("title")}</h3>
        <span className="text-xs text-text-muted">{sub}</span>
      </div>
      <EnnichiHelp topic="lanternes" view={view} className="ml-auto" />
    </div>
  );

  if (view.phase === "closed") {
    // La place du joueur seulement (pas tout le classement), et ses lots de l'omikuji qui n'ont pas été écartés
    const [result, awards] = userId
      ? await Promise.all([prisma.ennichiResult.findFirst({ where: { edition: view.edition, userId }, select: { rank: true, title: true } }), myAwards(view.edition, userId)])
      : [null, []];
    const wins = awards.filter((a) => a.kind === "OMIKUJI" && a.state !== "SKIPPED").length;
    return (
      <section className="enn">
        <div className="lacquer rounded-card banner m3-b m3-b-end">
          {head(t("phase.closed"))}
          <div className="next-gift">
            <Lantern kanji="祭" on width={34} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p>
                {result ? t("banner.finished", { rank: result.rank, title: result.title ?? "none" }) : t("banner.thanks")}
                {wins > 0 && ` ${t("banner.wins", { count: wins })}`}
              </p>
              <p className="text-xs text-text-muted">{t("banner.resultsReady")}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/ennichi/banzuke" className={buttonClasses("primary", "", "sm")}>
              {t("banner.seeResults")}
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const next = view.nextTier !== null ? view.tiers[view.nextTier] : null;
  const pct = tierProgress(view.lit, view.tiers.map((x) => ({ lanterns: x.lanterns })), view.nextTier);
  const target = countdownTarget(view);
  const live = view.phase === "live";
  return (
    <section className="enn">
      <div className="lacquer rounded-card banner m3-b">
        {head(t(`phase.${view.phase}`))}
        <Street {...streetLit(view)}>
          <div className="street-over">
            <div className="street-count">
              <b className="tabular-nums">{format.number(view.lit)}</b>
              <span>{t("banner.lit", { count: view.lit, placed: format.number(view.placed) })}</span>
            </div>
            {live && <span className="x2">{t("x2", { n: view.multiplier })}</span>}
          </div>
        </Street>
        <div className="m3-b-info">
          <div className="m3-cd-row">{target && <Countdown target={target} serverNow={new Date().toISOString()} />}</div>
          {next && (
            <div className="bar" style={{ ["--v" as string]: `${pct}%` }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t("banner.progress")}>
              <i />
            </div>
          )}
          {next ? (
            <div className="next-gift">
              <Lantern kanji={next.kanji} on={false} width={34} />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <p>
                  <b>{t("banner.next", { at: format.number(next.lanterns), missing: format.number(Math.max(0, next.lanterns - view.lit)) })}</b>
                </p>
                <LotGifts lot={next.lot} compact />
                {next.choiceVouchers > 0 && <span className="text-xs font-bold">{t("vouchers", { count: next.choiceVouchers })}</span>}
              </div>
            </div>
          ) : (
            <div className="next-gift">
              <Lantern kanji={view.tiers.at(-1)?.kanji ?? "祭"} on width={34} />
              <p>
                <b>{t("banner.allDone", { count: view.tiers.length })}</b>
              </p>
            </div>
          )}
          {view.phase === "closing" && <p className="text-xs text-text-muted">{t("banner.closingNote")}</p>}
          <div className="flex flex-wrap gap-2">
            {live && (
              <Link href="/parrainage" className={buttonClasses("primary", "", "sm")}>
                {t("invite")}
              </Link>
            )}
            <Link href="/ennichi" className={buttonClasses("secondary", "", "sm")}>
              {t("banner.seeFete")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
