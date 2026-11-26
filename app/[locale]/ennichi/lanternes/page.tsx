import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { EnnichiHelp } from "@/components/ennichi/Help";
import { EnnichiNotStarted } from "@/components/ennichi/NotStarted";
import { Lantern } from "@/components/ennichi/parts";
import { Seal } from "@/components/ennichi/Seal";
import "@/components/ennichi/ennichi-base.css";
import "@/components/ennichi/ennichi.css";
import { PageShell } from "@/components/PageShell";
import { LotGifts } from "@/components/referral/LotGifts";
import { Link } from "@/i18n/navigation";
import { ennichiView, myFete } from "@/server/ennichi/queries";
import { getCurrentUser } from "@/server/user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ennichi.lanternes");
  return { title: t("title") };
}

/**
 * Lanternes (maquette « Liste des paliers ») : les quatre cadeaux pour tous, leur seuil, ce qui a été versé et à combien
 * de joueurs ; à côté, si le joueur en fait partie et ce qu'il a reçu.
 */
export default async function LanternsPage() {
  const [t, tPage, format, locale, user] = await Promise.all([getTranslations("ennichi.lanternes"), getTranslations("ennichi.page"), getFormatter(), getLocale(), getCurrentUser()]);
  const view = await ennichiView(locale);
  // Fête coupée ou annoncée : ni paliers ni « ouvre un booster » (une ouverture ne compte qu'à partir du début)
  if (view.phase === "off" || view.phase === "before") return <EnnichiNotStarted view={view} />;
  const mine = user && !user.isGuest ? await myFete(user.id, view) : null;
  const elig = mine?.eligible ?? false;
  const dateHour = (iso: string) => format.dateTime(new Date(iso), { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
  return (
    <PageShell>
      <div className="enn flex flex-col gap-4">
        <Link href="/ennichi" className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-bold text-text-muted hover:text-text">
          <span aria-hidden="true">←</span> {t("back")}
        </Link>
        <div className="flex items-center gap-3">
          <Seal kanji="灯" />
          <h1 className="m3-h2 font-heading">{t("title")}</h1>
          <EnnichiHelp topic="lanternes" view={view} className="ml-auto" />
        </div>
        <p className="text-xs text-text-muted">{t("lead")}</p>
        <div className="m3-lant">
          <section className="lacquer rounded-card">
            <div className="flex flex-wrap items-baseline justify-between gap-2 p-4 pb-1.5">
              <h2 className="font-title text-base font-bold">{t("gifts", { count: view.tiers.length })}</h2>
              <span className="text-xs text-text-muted">{t("counts", { lit: view.lit, placed: format.number(view.placed) })}</span>
            </div>
            <ol className="tiers">
              {view.tiers.map((tier) => {
                const done = tier.reachedAt !== null;
                const next = view.nextTier === tier.index;
                const color = done ? "text-hisui" : next ? "text-kin" : "text-text-muted";
                return (
                  <li key={tier.index} className={`tier${next ? " is-next" : ""}`}>
                    <Lantern kanji={tier.kanji} on={done} width={44} className={done ? "lit-now" : ""} style={{ ["--ld" as string]: `${tier.index * 280}ms` }} />
                    <div className="tier-r">
                      <div className="tier-h">
                        <b>{t("at", { count: tier.lanterns })}</b>
                        <span className={`tier-s ${color}`}>
                          {done ? t("served", { count: tier.served }) : next ? t("missing", { count: Math.max(0, tier.lanterns - view.lit) }) : t("later")}
                        </span>
                      </div>
                      <LotGifts lot={tier.lot} compact />
                      {tier.choiceVouchers > 0 && <span className="text-xs font-bold">{tPage("vouchers", { count: tier.choiceVouchers })}</span>}
                      <span className="text-xs text-text-muted">{done && tier.reachedAt ? t("reachedOn", { date: dateHour(tier.reachedAt) }) : next ? t("nextOne") : t("afterThat")}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
          <div className="m3-side">
            <div className={`elig${elig ? "" : " m3-no"}`}>
              <span aria-hidden="true" lang="ja" className="seal flex shrink-0 items-center justify-center rounded-sm font-seal">
                {elig ? "✓" : "灯"}
              </span>
              <span>
                {t("who")} <b>{elig ? t("youAreIn") : view.phase === "closed" ? t("youWereOut") : t("openOne")}</b>
              </span>
            </div>
            {mine?.received && (
              <section className="flex flex-col gap-2 lacquer rounded-card p-4">
                <span className="text-[11px] font-bold tracking-wide text-text-muted uppercase">{t("youGot")}</span>
                <LotGifts lot={mine.received} />
                {mine.receivedVouchers > 0 && <span className="text-xs font-bold">{tPage("vouchers", { count: mine.receivedVouchers })}</span>}
              </section>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
