import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { ManageCookiesButton } from "@/components/consent/ManageCookiesButton";
import { DeletionPanel } from "@/components/data/DeletionPanel";
import { UsernameForm } from "@/components/data/UsernameForm";
import { GuestBootstrap } from "@/components/GuestBootstrap";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { PageShell } from "@/components/PageShell";
import { SectionTitle } from "@/components/SectionTitle";
import { Button } from "@/components/ui/Button";
import { Link } from "@/i18n/navigation";
import { deletionDueAt } from "@/lib/account/deletion";
import { prisma } from "@/server/db";
import { getSetting } from "@/server/settings";
import { getCurrentUser } from "@/server/user";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const card = "flex flex-col gap-3 rounded-lg border border-border bg-surface p-4";

/** « Mes données » : accès et portabilité, rectification, suppression, cookies (RGPD). */
export default async function MyDataPage() {
  const [t, format, user] = await Promise.all([getTranslations("data"), getFormatter(), getCurrentUser()]);
  if (!user) {
    return (
      <PageShell>
        <GuestBootstrap />
      </PageShell>
    );
  }

  const [exportsPerDay, usernameDays, graceDays, requests] = await Promise.all([
    getSetting("account.exportsPerDay"),
    getSetting("account.usernameChangeDays"),
    getSetting("account.deletionGraceDays"),
    prisma.dataRequest.findMany({
      where: { userId: user.id },
      orderBy: { requestedAt: "desc" },
      take: 10,
      select: { id: true, kind: true, status: true, requestedAt: true, dueAt: true },
    }),
  ]);
  const pending = requests.find((r) => r.kind === "DELETION" && r.status === "PENDING");
  const dueAt = user.deletionRequestedAt ? (pending?.dueAt ?? deletionDueAt(user.deletionRequestedAt, graceDays)) : null;

  return (
    <PageShell>
      <Link href="/compte" className="inline-flex min-h-11 items-center self-start text-sm text-text-muted underline-offset-4 hover:underline">
        ← {t("back")}
      </Link>
      <SectionTitle level={1} kanji="私" title={t("title")} subtitle={t("intro")} />

      <section className={card} aria-labelledby="data-export">
        <h2 id="data-export" className="text-lg font-bold">
          {t("export.title")}
        </h2>
        <p className="text-sm text-text-muted">{t("export.body")}</p>
        {/* Formulaire POST classique : le navigateur télécharge le fichier, sans JavaScript */}
        <form method="post" action="/api/me/export" className="flex flex-col gap-2">
          <Button type="submit" variant="primary" className="self-start">
            {t("export.submit")}
          </Button>
          <p className="text-xs text-text-muted">{t("export.limit", { count: exportsPerDay })}</p>
        </form>
      </section>

      <section className={card} aria-labelledby="data-rectify">
        <h2 id="data-rectify" className="text-lg font-bold">
          {t("rectify.title")}
        </h2>
        {user.isGuest ? (
          <p className="text-sm text-text-muted">{t("rectify.guest")}</p>
        ) : (
          <UsernameForm current={user.username} cooldownDays={usernameDays} />
        )}
        <LocaleSwitcher />
        <p className="text-xs text-text-muted">{t("rectify.localeHint")}</p>
        <Link href="/compte#confidentialite" className="inline-flex min-h-11 items-center self-start text-sm font-medium text-ai underline underline-offset-4">
          {t("rectify.privacyLink")}
        </Link>
      </section>

      <section className={card} aria-labelledby="data-cookies">
        <h2 id="data-cookies" className="text-lg font-bold">
          {t("cookies.title")}
        </h2>
        <p className="text-sm text-text-muted">{t("cookies.body")}</p>
        <ManageCookiesButton className="self-start" />
      </section>

      <section className={`${card} border-shu/60`} aria-labelledby="data-deletion">
        <h2 id="data-deletion" className="text-lg font-bold">
          {t("deletion.title")}
        </h2>
        <DeletionPanel username={user.username} graceDays={graceDays} dueAt={dueAt?.toISOString() ?? null} />
      </section>

      <section className={card} aria-labelledby="data-history">
        <h2 id="data-history" className="text-lg font-bold">
          {t("history.title")}
        </h2>
        {requests.length === 0 ? (
          <p className="text-sm text-text-muted">{t("history.empty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span className="font-medium">{t(`history.kinds.${r.kind}`)}</span>
                <span className="text-text-muted">{format.dateTime(r.requestedAt, { dateStyle: "medium", timeStyle: "short" })}</span>
                <span>{t(`history.statuses.${r.status}`)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
