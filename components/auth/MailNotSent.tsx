"use client";

import { useTranslations } from "next-intl";

/** Prévient qu'aucun e-mail n'est parti tant que Resend n'est pas configuré. */
export function MailNotSent() {
  const t = useTranslations("mail");
  return (
    <div role="status" className="flex flex-col gap-1 rounded-button border border-kin px-3 py-2 text-sm">
      <p>{t("disabled")}</p>
      {process.env.NODE_ENV === "development" && <p className="text-text-muted">{t("devHint")}</p>}
    </div>
  );
}
