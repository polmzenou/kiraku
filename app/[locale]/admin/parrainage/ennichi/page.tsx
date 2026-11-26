import type { ReactNode } from "react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { EnnichiCloseActions } from "@/components/admin/referral/EnnichiCloseActions";
import { EnnichiSettingsForm } from "@/components/admin/referral/EnnichiSettingsForm";
import { ReferralAdminTabs } from "@/components/admin/referral/ReferralAdminTabs";
import { SettingLogList } from "@/components/admin/SettingLogList";
import { Seal } from "@/components/ennichi/Seal";
import { LotGifts } from "@/components/referral/LotGifts";
import { Link } from "@/i18n/navigation";
import { canManageReferrals } from "@/lib/admin/roles";
import { ENNICHI_FORM_KEYS, type EnnichiSettings } from "@/lib/settings/ennichi-form";
import { recentSettingLogs, requireAdminView } from "@/server/admin";
import { lotOptions } from "@/server/economy/admin-queries";
import { ennichiAdminView, type EnnichiAdminView } from "@/server/ennichi/admin-queries";
import { heldReferralCount } from "@/server/referral/admin-queries";
import { getSetting } from "@/server/settings";

type T = Awaited<ReturnType<typeof getTranslations<"admin.referralV2.ennichi">>>;
type Format = Awaited<ReturnType<typeof getFormatter>>;

function Bar({ pct }: { pct: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-pill bg-surface-2" aria-hidden="true">
      <div className="h-full rounded-pill bg-linear-to-r from-kin to-shu" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

/** « En direct » : lanternes allumées, amis arrivés, paliers atteints, puis l'envoi de chaque palier atteint et le prochain. */
function LiveCard({ data, t, format, pill }: { data: EnnichiAdminView; t: T; format: Format; pill: ReactNode }) {
  const { view, sending } = data;
  const reached = view.tiers.filter((tier) => tier.reachedAt !== null).length;
  const sendingOf = new Map(sending.map((s) => [s.tier, s]));
  const kpis = [
    { value: format.number(view.lit), label: t("live.lit"), tone: "text-kin" },
    { value: format.number(view.placed), label: t("live.placed"), tone: "" },
    { value: `${reached} / ${view.tiers.length}`, label: t("live.reached"), tone: "text-hisui" },
  ];
  // Le prochain palier tant que des lanternes peuvent encore s'allumer (fête et clôture), puis seulement les paliers atteints
  const lighting = view.phase === "live" || view.phase === "closing";
  const shown = view.tiers.filter((tier) => tier.reachedAt !== null || (lighting && tier.index === view.nextTier));
  return (
    <section className="flex flex-col gap-4 lacquer rounded-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-title text-lg font-bold">{t("live.title")}</h3>
        {pill}
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {kpis.map((k) => (
          <li key={k.label} className="flex min-w-0 flex-col gap-0.5 rounded-control border border-border bg-surface p-3">
            <b className={`font-heading text-xl tabular-nums ${k.tone}`}>{k.value}</b>
            <span className="text-xs text-text-muted">{k.label}</span>
          </li>
        ))}
      </ul>
      {shown.map((tier) => {
        const s = sendingOf.get(tier.index);
        const total = s ? s.served + s.pending : 0;
        const right = s
          ? `${t("live.served", { served: format.number(s.served), total: format.number(total) })} · ${s.finishedAt && s.pending === 0 ? t("live.sent") : t("live.sending")}`
          : t("live.toward", { lit: format.number(view.lit), lanterns: format.number(tier.lanterns) });
        const pct = s ? (total > 0 ? (s.served / total) * 100 : 100) : tier.lanterns > 0 ? (view.lit / tier.lanterns) * 100 : 100;
        return (
          <div key={tier.index} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="flex items-center gap-2">
                <Seal kanji={tier.kanji} size={28} tone={s ? "shu" : "mut"} />
                <b className="text-sm">{t("live.tier", { n: tier.index + 1, lanterns: tier.lanterns })}</b>
              </span>
              <span className="text-xs text-text-muted tabular-nums">{right}</span>
            </div>
            <LotGifts lot={tier.lot} compact />
            {tier.choiceVouchers > 0 && <span className="text-xs font-bold">{t("live.vouchers", { count: tier.choiceVouchers })}</span>}
            <Bar pct={pct} />
          </div>
        );
      })}
    </section>
  );
}

/** « Clôture » : selon la phase, la date de fin, les boutons Contrôler puis Arrêter et tirer, ou le tirage fait. */
function CloseCard({ data, t, format, canManage, now }: { data: EnnichiAdminView; t: T; format: Format; canManage: boolean; now: Date }) {
  const { view, draw } = data;
  const when = (iso: string | null) => (iso ? format.dateTime(new Date(iso), { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }) : "");
  // Empreintes et graine : seules elles se coupent n'importe où, le reste de la phrase se coupe entre les mots
  const h = (chunks: ReactNode) => <span className="break-all">{chunks}</span>;
  const seed = data.committedAt && view.seedHash && <p className="text-xs text-text-muted">{t.rich("close.seed", { date: when(data.committedAt), hash: view.seedHash, h })}</p>;
  const omikuji = <p className="text-xs text-text-muted">{t("close.omikuji", { lots: data.prizes, tickets: data.tickets })}</p>;
  let body: ReactNode;
  if (view.phase === "off") body = <p className="text-sm text-text-muted">{t("close.off")}</p>;
  else if (view.phase === "before" || view.phase === "live") {
    body = (
      <>
        <p className="text-sm text-text-muted">{t(view.phase === "before" ? "close.before" : "close.live", { date: when(view.endsAt) })}</p>
        {omikuji}
        {seed}
      </>
    );
  } else if (view.phase === "closing") {
    const overdue = view.closesAt !== null && new Date(view.closesAt).getTime() <= now.getTime();
    body = (
      <>
        <p className="text-sm text-text-muted">{view.checkedAt ? t("close.checkedAt", { date: when(view.checkedAt) }) : t("close.toCheck")}</p>
        {canManage ? <EnnichiCloseActions edition={view.edition} checked={view.checkedAt !== null} held={data.held} /> : <p className="text-sm">{t("close.readOnly")}</p>}
        {omikuji}
        <p className="text-xs text-text-muted">{overdue ? t("close.overdue") : t("close.fallback", { date: when(view.closesAt) })}</p>
        {seed}
      </>
    );
  } else {
    body = (
      <>
        <p className="text-sm">{draw?.by ? t("close.drawnBy", { date: when(view.drawnAt), name: draw.by }) : t("close.drawnByCron", { date: when(view.drawnAt) })}</p>
        {draw && (
          <p className="text-sm text-text-muted">
            {t("close.awards", { banzuke: draw.banzuke, omikuji: draw.omikuji, paid: draw.paid, skipped: draw.skipped, pending: draw.pending })}
          </p>
        )}
        <p className="text-xs text-text-muted">{t.rich("close.proof", { tickets: format.number(data.tickets), hash: draw?.ticketsHash ?? "", h })}</p>
        <p className="text-xs text-text-muted">{t.rich("close.seeds", { hash: view.seedHash ?? "", seed: draw?.seed ?? "", h })}</p>
        <p className="text-xs text-text-muted">{t("close.next")}</p>
      </>
    );
  }
  return (
    <section className="flex flex-col gap-3 lacquer rounded-card p-4">
      <h3 className="font-title text-lg font-bold">{t("close.title")}</h3>
      {body}
    </section>
  );
}

/** Haut du banzuke (10 premiers), en direct jusqu'au tirage puis final, avec ce que chaque place rapporte. */
function BanzukeCard({ data, t, format }: { data: EnnichiAdminView; t: T; format: Format }) {
  const { banzuke } = data;
  return (
    <section className="flex flex-col gap-3 lacquer rounded-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-title text-lg font-bold">{t("banzuke.title")}</h3>
        <span className="text-xs text-text-muted">{t(banzuke.final ? "banzuke.final" : "banzuke.live", { count: banzuke.total })}</span>
      </div>
      {banzuke.top.length === 0 ? (
        <p className="text-sm text-text-muted">{t("banzuke.empty")}</p>
      ) : (
        <ol className="flex flex-col divide-y divide-border">
          {banzuke.top.map((row) => (
            <li key={row.rank} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
              <b className="w-7 shrink-0 text-center font-heading tabular-nums">{row.rank}</b>
              <span className="flex min-w-0 flex-1 flex-col">
                {row.userId ? (
                  <Link href={`/admin/utilisateurs/${row.userId}`} className="truncate font-bold text-link underline-offset-4 hover:underline">
                    {row.name}
                  </Link>
                ) : (
                  <span className="truncate font-bold text-text-muted">{row.name || t("banzuke.deleted")}</span>
                )}
                <span className="text-xs text-text-muted">{t("banzuke.friends", { count: row.count })}</span>
              </span>
              <span className="flex basis-full flex-col items-start gap-1 pl-10 sm:basis-auto sm:items-end sm:pl-0">
                {row.prize ? (
                  <>
                    {row.prize.title && <span className="text-xs font-bold text-kin">{t(`settings.titles.${row.prize.title}`)}</span>}
                    {row.prize.lot && <LotGifts lot={row.prize.lot} compact />}
                    {(row.prize.choiceVouchers > 0 || row.prize.oneOfOne) && (
                      <span className="text-xs font-bold">
                        {[row.prize.oneOfOne ? t("banzuke.oneOfOne") : null, row.prize.choiceVouchers > 0 ? t("live.vouchers", { count: row.prize.choiceVouchers }) : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-xs text-text-muted">{t("banzuke.none")}</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
      {banzuke.total > banzuke.top.length && (
        <p className="text-xs text-text-muted">
          {t("banzuke.more", { count: format.number(banzuke.total) })}{" "}
          <Link href="/ennichi/banzuke" className="font-bold text-link underline-offset-4 hover:underline">
            {t("banzuke.open")}
          </Link>
        </p>
      )}
    </section>
  );
}

/**
 * Admin de l'Ennichi (maquette « Tableau de bord », atelier équipe) : à gauche le suivi en direct, la clôture et le haut
 * du banzuke ; à droite les réglages. Toute l'équipe (ADMIN et DEV, canManageReferrals) règle, contrôle et tire ;
 * chaque action et chaque réglage changé vont au journal admin.
 */
export default async function AdminEnnichiPage() {
  const { user } = await requireAdminView();
  const locale = await getLocale();
  const now = new Date();
  const [t, format, data, values, lots, logs, held] = await Promise.all([
    getTranslations("admin.referralV2.ennichi"),
    getFormatter(),
    ennichiAdminView(locale, now),
    Promise.all(ENNICHI_FORM_KEYS.map((k) => getSetting(k))),
    lotOptions(locale),
    recentSettingLogs(["ennichi."]),
    heldReferralCount(),
  ]);
  const settings = Object.fromEntries(ENNICHI_FORM_KEYS.map((k, i) => [k, values[i]])) as EnnichiSettings;
  const canManage = canManageReferrals(user.role);
  const { view } = data;
  const target = view.phase === "before" ? view.startsAt : view.phase === "live" ? view.endsAt : view.phase === "closing" ? view.closesAt : null;
  // En jours au-delà de deux jours (« dans 11 jours », pas « dans 2 semaines »), puis en heures, puis en minutes
  const relative = (date: Date) => {
    const left = Math.abs(date.getTime() - now.getTime());
    const unit = left >= 2 * 86_400_000 ? "day" : left >= 2 * 3_600_000 ? "hour" : "minute";
    return format.relativeTime(date, { now, unit });
  };
  const tone = { off: "border-border text-text-muted", before: "border-ai/60 text-ai", live: "border-kin/60 text-kin", closing: "border-shu/60 text-shu", closed: "border-border text-text-muted" }[view.phase];
  const pill = (
    <span className={`rounded-pill border px-2.5 py-0.5 text-xs font-bold ${tone}`}>
      {t(`phase.${view.phase}`, { when: target ? relative(new Date(target)) : "" })}
    </span>
  );

  return (
    <div className="flex flex-col gap-6">
      <ReferralAdminTabs active="ennichi" held={held} />
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
      </div>
      {view.phase === "off" && (
        <p role="note" className="rounded-card border border-ai/40 bg-ai/10 px-4 py-3 text-sm">
          {t("off")}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <LiveCard data={data} t={t} format={format} pill={pill} />
          <CloseCard data={data} t={t} format={format} canManage={canManage} now={now} />
          <BanzukeCard data={data} t={t} format={format} />
        </div>
        <section className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
          <h3 className="font-title text-lg font-bold">{t("settings.title")}</h3>
          {canManage ? <EnnichiSettingsForm initial={settings} lots={lots} /> : <p className="text-sm text-text-muted">{t("settings.readOnly")}</p>}
        </section>
      </div>
      <SettingLogList logs={logs} />
    </div>
  );
}
