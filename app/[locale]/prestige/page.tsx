import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { GuestBootstrap } from "@/components/GuestBootstrap";
import { PageShell } from "@/components/PageShell";
import { PrestigeAccess } from "@/components/prestige/PrestigeAccess";
import { PrestigeHero } from "@/components/prestige/PrestigeHero";
import { RebirthFlow, type RarityInfo } from "@/components/prestige/RebirthFlow";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { isFrozen } from "@/lib/account/deletion";
import { isStaff } from "@/lib/admin/roles";
import { rarityColor } from "@/lib/catalog/appearance";
import { getRarityDefinitions } from "@/server/catalog/rarities";
import { getPrestigeOverview, getSpecialCopies, rebirthCtx } from "@/server/prestige/queries";
import { getCurrentUser } from "@/server/user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("prestige");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/**
 * Prestige (étape 16) : ce que la renaissance demande, ce qu'elle apporte, ce qu'elle laisse, puis le parcours
 * (choix des héritières, récapitulatif, confirmation maintenue, rite 転生). Caché tant que l'admin ne l'allume pas
 * (404), sauf pour l'équipe qui en voit l'aperçu.
 */
export default async function PrestigePage() {
  const [user, t, locale, format, ctx, definitions] = await Promise.all([
    getCurrentUser(),
    getTranslations("prestige"),
    getLocale(),
    getFormatter(),
    rebirthCtx(),
    getRarityDefinitions(),
  ]);
  const staff = isStaff(user?.role);
  if (!ctx.rules.enabled && !staff) notFound();
  if (!user) {
    return (
      <PageShell>
        <GuestBootstrap />
      </PageShell>
    );
  }
  if (user.bannedAt || isFrozen(user)) notFound();

  const rarities: RarityInfo[] = definitions.map((d) => ({
    key: d.key,
    seal: d.seal,
    name: locale === "en" ? d.nameEn : d.nameFr,
    color: rarityColor(d.key, d.appearance),
  }));

  if (user.isGuest) {
    return (
      <PageShell>
        <PrestigeHero prestige={0} slots={ctx.rules.keepSlots} username={user.username} image={user.image} decor={user.decor} />
        <section className="flex flex-col items-center gap-3 lacquer rounded-card p-5 text-center">
          <h2 className="font-title text-lg font-extrabold">{t("guest.title")}</h2>
          <p className="max-w-prose text-sm text-text-muted">{t("guest.body")}</p>
          <ButtonLink href="/connexion" variant="primary">
            {t("guest.cta")}
          </ButtonLink>
        </section>
      </PageShell>
    );
  }

  const overview = await getPrestigeOverview(user.id, ctx);
  if (!overview) notFound();
  const tooMany = overview.copies > ctx.rules.maxCopies;
  const reason = !overview.eligibility.eligible ? "locked" : overview.blockers.length > 0 || overview.nextAt || tooMany ? "blocked" : null;
  // Les héritières possibles ne servent qu'au choix, inaccessible tant que le joueur ne peut pas renaître
  const special = reason === null ? await getSpecialCopies(user.id, locale) : [];

  return (
    <PageShell>
      {!ctx.rules.enabled && <p className="lacquer rounded-card border-ai/50 p-3 text-sm text-ai">{t("preview")}</p>}
      <PrestigeHero prestige={overview.prestige} slots={ctx.rules.keepSlots} username={user.username} image={user.image} decor={user.decor} />
      <PrestigeAccess eligibility={overview.eligibility} blockers={overview.blockers} rarities={rarities} />
      {overview.nextAt && (
        <p className="lacquer rounded-card p-3 text-sm">{t("access.tooSoon", { date: format.dateTime(overview.nextAt, { dateStyle: "long", timeStyle: "short" }) })}</p>
      )}
      {tooMany && <p className="lacquer rounded-card p-3 text-sm">{t("access.tooMany", { count: overview.copies, max: ctx.rules.maxCopies })}</p>}

      <section className="flex flex-col gap-3">
        <h2 className="font-title text-lg font-extrabold">{t("gains.title")}</h2>
        <ul className="flex flex-col gap-3 text-sm">
          {(["roman", "heirs", "engraved", "cosmetics", "zeni", "emaki"] as const).map((k) => (
            <li key={k} className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-3">
              <span aria-hidden="true" lang="ja" className="grid size-7 place-items-center rounded-[5px] border border-kin/50 font-seal text-kin">
                {t(`gains.${k}.kanji`)}
              </span>
              <span>
                <b>{t(`gains.${k}.title`)}</b> {t(`gains.${k}.body`)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-title text-lg font-extrabold">{t("leave.title")}</h2>
        <ul className="flex flex-col gap-3 text-sm">
          {(["cards", "keep"] as const).map((k) => (
            <li key={k} className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-3">
              <span aria-hidden="true" lang="ja" className="grid size-7 place-items-center rounded-[5px] border border-border font-seal text-text-muted">
                {t(`leave.${k}.kanji`)}
              </span>
              <span>
                <b>{t(`leave.${k}.title`)}</b> {t(`leave.${k}.body`)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <RebirthFlow
        reason={reason}
        prestige={overview.prestige}
        slots={ctx.rules.keepSlots}
        special={special}
        rarities={rarities}
        player={{ username: user.username, image: user.image, frame: user.decor.frame }}
      />
    </PageShell>
  );
}
