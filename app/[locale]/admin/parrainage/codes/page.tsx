import { getFormatter, getTranslations } from "next-intl/server";
import { ReferralAdminTabs } from "@/components/admin/referral/ReferralAdminTabs";
import { VanityClearButton, VanityCodeForm } from "@/components/admin/referral/VanityCodeForm";
import { Link } from "@/i18n/navigation";
import { canManageReferrals } from "@/lib/admin/roles";
import { requireAdminView } from "@/server/admin";
import { heldReferralCount, vanityCodes } from "@/server/referral/admin-queries";

/**
 * Codes perso du parrainage (maquette de l'atelier équipe) : l'équipe entière (ADMIN et DEV) pose ou retire le code
 * d'un joueur, pour les Ambassadeurs et les streamers partenaires ; le code standard du joueur marche toujours. Chaque
 * pose et chaque retrait sont écrits dans le journal de l'équipe.
 */
export default async function AdminReferralCodesPage() {
  const { user } = await requireAdminView();
  const [t, format, held, codes] = await Promise.all([getTranslations("admin.referralV2.codes"), getFormatter(), heldReferralCount(), vanityCodes()]);
  const canManage = canManageReferrals(user.role);

  return (
    <div className="flex flex-col gap-6">
      <ReferralAdminTabs active="codes" held={held} />
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
      </div>

      {canManage && (
        <section className="flex flex-col gap-3 lacquer rounded-card p-4" aria-labelledby="poser-code">
          <h3 id="poser-code" className="font-title text-base font-bold">
            {t("formTitle")}
          </h3>
          <VanityCodeForm />
        </section>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="codes-poses">
        <h3 id="codes-poses" className="font-title text-base font-bold">
          {t("listTitle", { count: codes.length })}
        </h3>
        {codes.length === 0 ? (
          <p className="lacquer rounded-card p-6 text-center text-sm text-text-muted">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {codes.map((c) => (
              <li key={c.userId} className="flex flex-col gap-2 lacquer rounded-card p-3.5 md:flex-row md:items-center md:gap-4">
                <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
                  <Link href={`/admin/utilisateurs/${c.userId}`} className="font-bold text-link underline-offset-4 hover:underline">
                    {c.name}
                  </Link>
                  <b className="font-title tracking-[0.18em] text-kin">{c.code}</b>
                  {c.ambassador && <span className="rounded-pill border border-hisui/60 px-2 py-0.5 text-[11px] font-bold text-hisui">{t("ambassador")}</span>}
                </div>
                <p className="text-xs text-text-muted md:text-right">
                  {t("standard", { code: c.standard })}
                  {c.setAt && (
                    <>
                      <br />
                      {t("setBy", { name: c.setBy ?? "", date: format.dateTime(new Date(c.setAt), { day: "numeric", month: "short", year: "numeric" }) })}
                    </>
                  )}
                </p>
                {canManage && <VanityClearButton userId={c.userId} name={c.name} code={c.code} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
