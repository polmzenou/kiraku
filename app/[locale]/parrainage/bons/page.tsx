import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Fuda } from "@/components/fuda/Fuda";
import { GuestBootstrap } from "@/components/GuestBootstrap";
import { PageShell } from "@/components/PageShell";
import { VoucherPicker } from "@/components/referral/VoucherPicker";
import { VoucherTicket } from "@/components/referral/VoucherTicket";
import { chipClasses } from "@/components/ui/Chip";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Link } from "@/i18n/navigation";
import { pickVoucherGroup, voucherMilestones, voucherParam, type VoucherGroup } from "@/lib/referral/vouchers";
import { referralV2Rules } from "@/server/referral/deps";
import { usedVouchersOf, voucherCards, voucherGroupsOf, type UsedVoucherView } from "@/server/referral/vouchers";
import { getCurrentUser } from "@/server/user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("referralV2.vouchers");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

function Header({ kanji, title, lead, back }: { kanji: string; title: string; lead: string; back: string }) {
  return (
    <div className="flex flex-col gap-3">
      <Link href="/parrainage" className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-bold text-text-muted hover:text-text">
        <span aria-hidden="true">←</span> {back}
      </Link>
      <div className="flex items-center gap-3">
        <span aria-hidden="true" lang="ja" className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-shu-btn font-seal text-xl text-washi-paper">
          {kanji}
        </span>
        <div className="min-w-0">
          <h1 className="font-heading text-2xl">{title}</h1>
          <p className="text-sm text-text-muted">{lead}</p>
        </div>
      </div>
    </div>
  );
}

/** Onglets des types de bon (quand le joueur a les deux) : liens ?bon=, sans JavaScript. */
async function KindTabs({ groups, active }: { groups: readonly VoucherGroup[]; active: VoucherGroup }) {
  if (groups.length < 2) return null;
  const t = await getTranslations("referralV2.vouchers");
  return (
    <nav aria-label={t("tabsLabel")} className="flex flex-wrap gap-2">
      {groups.map((g) => (
        <Link
          key={g.kind}
          href={{ pathname: "/parrainage/bons", query: { bon: voucherParam(g.kind) } }}
          aria-current={g.kind === active.kind ? "page" : undefined}
          className={chipClasses(g.kind === active.kind)}
        >
          <VoucherTicket kind={g.kind} width={26} />
          {t(`kind.${g.kind}`)}
          {g.count > 1 && <span className="tabular-nums">· {g.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

async function UsedVouchers({ list }: { list: readonly UsedVoucherView[] }) {
  if (list.length === 0) return null;
  const [t, format] = await Promise.all([getTranslations("referralV2.vouchers"), getFormatter()]);
  return (
    <section className="flex flex-col gap-3 lacquer rounded-card p-4" aria-labelledby="bons-utilises">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="bons-utilises" className="font-title text-base font-bold">{t("used.title")}</h2>
        <span className="text-xs text-text-muted tabular-nums">{format.number(list.length)}</span>
      </div>
      <ul className="flex flex-col gap-2.5">
        {list.map((u) => (
          <li key={u.id} className="grid grid-cols-[52px_minmax(0,1fr)] items-center gap-3">
            <span className="block w-13">{u.card && <Fuda card={u.card} series={u.card.series} size="sm" tilt={false} still sizes="52px" />}</span>
            <span className="min-w-0">
              <b className="block truncate font-title">{u.card?.name ?? t("used.unknown")}</b>
              <span className="text-xs text-text-muted">
                {t("used.line", { kind: t(`kind.${u.kind}`), date: format.dateTime(u.usedAt, { day: "numeric", month: "long", year: "numeric" }) })}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Bons du joueur (maquette « Bons A · Grille ») : le choix de la carte pour le plus ancien bon du type ouvert, ou, sans
 * bon, où en trouver ; puis les bons déjà utilisés. Les bons arrivent tout seuls (paliers, Ennichi).
 */
export default async function VouchersPage({ searchParams }: PageProps<"/[locale]/parrainage/bons">) {
  const [t, format, user, locale, sp] = await Promise.all([getTranslations("referralV2.vouchers"), getFormatter(), getCurrentUser(), getLocale(), searchParams]);
  if (!user) {
    return (
      <PageShell>
        <GuestBootstrap />
      </PageShell>
    );
  }
  if (user.isGuest) {
    return (
      <PageShell>
        <Header kanji="選" title={t("title")} lead={t("lead")} back={t("back")} />
        <section className="flex flex-col items-start gap-3 lacquer rounded-card p-4">
          <p className="text-sm">{t("guest")}</p>
          <ButtonLink href="/parrainage" size="sm">{t("seeReferral")}</ButtonLink>
        </section>
      </PageShell>
    );
  }

  const [groups, used, rules] = await Promise.all([voucherGroupsOf(user.id), usedVouchersOf(user.id, locale), referralV2Rules()]);
  const group = pickVoucherGroup(groups, sp.bon);
  if (!group) {
    const at = voucherMilestones(rules.milestones).map((n) => format.number(n));
    return (
      <PageShell>
        <Header kanji="選" title={t("title")} lead={t("lead")} back={t("back")} />
        <section className="flex flex-col items-start gap-2 lacquer rounded-card p-4">
          <p className="text-sm">{t("none")}</p>
          {at.length > 0 && <p className="text-xs text-text-muted">{t("noneHint", { list: format.list(at, { type: "conjunction" }), count: at.length })}</p>}
          <ButtonLink href={{ pathname: "/parrainage", hash: "paliers" }} size="sm" className="mt-1">
            {t("seeMilestones")}
          </ButtonLink>
        </section>
        <UsedVouchers list={used} />
      </PageShell>
    );
  }

  const one = group.kind === "ONE_OF_ONE";
  const initial = await voucherCards({ userId: user.id, kind: group.kind, q: "", filter: "all", offset: 0, locale });
  return (
    <PageShell>
      <Header kanji={one ? "唯" : "選"} title={one ? t("titleOne") : t("titleMythic")} lead={one ? t("leadOne") : t("leadMythic")} back={t("back")} />
      <KindTabs groups={groups} active={group} />
      <VoucherPicker key={group.voucherId} voucherId={group.voucherId} kind={group.kind} initial={initial} />
      <UsedVouchers list={used} />
    </PageShell>
  );
}
