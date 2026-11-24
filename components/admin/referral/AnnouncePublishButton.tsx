"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { publishReferralAnnouncementAction } from "@/server/actions/admin-referral";
import { Button } from "../../ui/Button";
import { FormMessage } from "../fields";

/** Publier (ou mettre à jour) l'annonce du lancement, après une confirmation qui dit qui sera notifié. */
export function AnnouncePublishButton({ published }: { published: boolean }) {
  const t = useTranslations("admin.referralV2.announce");
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function publish() {
    setMessage(null);
    startTransition(async () => {
      const res = await publishReferralAnnouncementAction();
      setConfirm(false);
      if (!res.ok) return setMessage({ tone: "error", text: t(`errors.${res.error}`) });
      setLink(res.url || null);
      setMessage({ tone: "ok", text: published ? t("doneUpdate") : t("done") });
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {confirm ? (
        <div className="flex flex-col gap-2 rounded-control border border-border bg-surface-2 p-3">
          <p className="text-sm font-bold">{published ? t("confirmUpdate") : t("confirm")}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="primary" size="sm" disabled={pending} onClick={publish}>
              {published ? t("confirmUpdateButton") : t("confirmButton")}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setConfirm(false)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant={published ? "secondary" : "primary"} size="sm" className="self-start" disabled={pending} onClick={() => setConfirm(true)}>
          {published ? t("update") : t("publish")}
        </Button>
      )}
      <FormMessage message={message} />
      {link && (
        <a href={link} target="_blank" rel="noopener noreferrer" className="self-start text-sm font-bold text-link underline underline-offset-4">
          {t("open")}
        </a>
      )}
    </div>
  );
}
