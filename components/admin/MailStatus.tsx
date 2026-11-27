import { getTranslations } from "next-intl/server";
import { isResendTestSender, senderDomain } from "@/lib/mail/sender";
import { MailTestForm } from "./MailTestForm";

/**
 * État de l'envoi d'e-mails (Resend) : configuré ou non, domaine de l'expéditeur, alerte sur l'expéditeur de test,
 * et envoi d'un e-mail de test. Aucune valeur secrète n'est affichée.
 */
export async function MailStatus({ configured, from, defaultTo }: { configured: boolean; from: string | null; defaultTo: string }) {
  const t = await getTranslations("admin.mail");
  const domain = senderDomain(from);
  const testSender = isResendTestSender(from);
  const state = !configured ? "off" : testSender ? "test" : "on";

  return (
    <section aria-labelledby="mail-status" className="flex flex-col gap-4 lacquer rounded-card p-4">
      <div className="flex flex-col gap-1">
        <h3 id="mail-status" className="font-title text-lg font-bold">
          {t("title")}
        </h3>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-text-muted">{t("state")}</dt>
        <dd className={state === "on" ? "text-hisui" : "text-shu"}>{t(`states.${state}`)}</dd>
        <dt className="text-text-muted">{t("sender")}</dt>
        <dd className="min-w-0 break-all tabular-nums">{domain ?? t("none")}</dd>
      </dl>
      {state !== "on" && (
        <p role="note" className="rounded-control border border-shu/70 bg-shu/10 px-3 py-2.5 text-sm">
          {t(state === "off" ? "offHelp" : "testHelp")}
        </p>
      )}
      <MailTestForm defaultTo={defaultTo} />
    </section>
  );
}
