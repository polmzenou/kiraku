"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import type { UpdateSettingsResult } from "@/server/actions/admin-settings";
import { Button } from "../ui/Button";

/**
 * Barre d'enregistrement commune des nouveaux formulaires de réglages : liste des clés modifiées à
 * relire, confirmation, puis sauvegarde (une ligne AdminLog par clé côté serveur).
 */
export function SettingsSaveBar({
  valid,
  changedLabels,
  save,
}: {
  valid: boolean;
  /** Libellés des réglages modifiés par rapport aux valeurs en vigueur. */
  changedLabels: string[];
  save: () => Promise<UpdateSettingsResult>;
}) {
  const t = useTranslations("admin.settingsForm");
  const router = useRouter();
  const [reviewing, setReviewing] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      try {
        const res = await save();
        setReviewing(false);
        if (!res.ok) setMessage({ ok: false, text: t(`errors.${res.error}`) });
        else {
          setMessage({ ok: true, text: t("saved", { count: res.changed.length }) });
          router.refresh();
        }
      } catch {
        setMessage({ ok: false, text: t("errors.unexpected") });
      }
    });

  return (
    <div className="flex flex-col gap-3">
      {!valid && (
        <p role="alert" className="text-sm text-shu">
          {t("invalid")}
        </p>
      )}
      {reviewing && valid && changedLabels.length > 0 ? (
        <section className="flex flex-col gap-3 rounded-lg border border-shu bg-surface p-4" aria-live="polite">
          <h3 className="font-bold">{t("confirmTitle")}</h3>
          <ul className="list-inside list-disc text-sm">
            {changedLabels.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" onClick={() => setReviewing(false)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button type="button" variant="primary" onClick={confirm} disabled={pending}>
              {t("confirm")}
            </Button>
          </div>
        </section>
      ) : (
        <Button
          type="button"
          variant="primary"
          className="self-start"
          disabled={!valid || changedLabels.length === 0 || pending}
          onClick={() => {
            setMessage(null);
            setReviewing(true);
          }}
        >
          {changedLabels.length === 0 ? t("noChange") : t("review", { count: changedLabels.length })}
        </Button>
      )}
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-text-muted" : "text-shu"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
