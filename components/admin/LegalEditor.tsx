"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { LEGAL_BODY_MAX, LEGAL_TITLE_MAX } from "@/lib/legal/admin";
import { LEGAL_LOCALES, type LegalLocale, type LegalSlug } from "@/lib/legal/legal";
import { publishLegalAction, saveLegalDraftAction, type AdminLegalResult } from "@/server/actions/admin-legal";
import { LegalMarkdown } from "../legal/LegalMarkdown";
import { Button } from "../ui/Button";
import { ConfirmAction } from "./ConfirmAction";
import { Field, inputClass } from "./fields";
import { textareaClass } from "../ui/Field";

export type LegalEditorText = { title: string; body: string };

/**
 * Brouillon de la prochaine version d'une page légale, en français et en anglais, avec aperçu rendu
 * comme sur le site ; puis publication (et, pour les CGU, réacceptation forcée en option).
 */
export function LegalEditor({
  slug,
  draftVersion,
  nextVersion,
  initial,
}: {
  slug: LegalSlug;
  /** Version du brouillon en cours, ou null s'il n'y en a pas encore. */
  draftVersion: number | null;
  nextVersion: number;
  /** Texte de départ par langue : le brouillon s'il existe, sinon la version en vigueur. */
  initial: Record<LegalLocale, LegalEditorText>;
}) {
  const t = useTranslations("admin.legal");
  const router = useRouter();
  const [locale, setLocale] = useState<LegalLocale>("fr");
  const [texts, setTexts] = useState(initial);
  const [preview, setPreview] = useState(false);
  const [forceReaccept, setForceReaccept] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const current = texts[locale];
  const version = draftVersion ?? nextVersion;

  const errorText = (r: AdminLegalResult) => (r.ok ? null : t(`errors.${r.error}`));

  function save() {
    startTransition(async () => {
      setMessage(null);
      const r = await saveLegalDraftAction({ slug, locale, title: current.title, body: current.body });
      setMessage(r.ok ? { ok: true, text: t("saved", { version: r.version }) } : { ok: false, text: errorText(r)! });
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label={t("language")} className="flex gap-1 border-b border-border">
        {LEGAL_LOCALES.map((l) => (
          <button
            key={l}
            type="button"
            role="tab"
            aria-selected={locale === l}
            onClick={() => setLocale(l)}
            className={`min-h-11 border-b-[3px] px-4 text-sm font-bold ${locale === l ? "border-shu" : "border-transparent text-text-muted"}`}
          >
            {t(`locales.${l}`)}
          </button>
        ))}
      </div>

      <Field label={t("titleLabel")}>
        {(id) => (
          <input
            id={id}
            value={current.title}
            maxLength={LEGAL_TITLE_MAX}
            onChange={(e) => setTexts((x) => ({ ...x, [locale]: { ...x[locale], title: e.target.value } }))}
            className={inputClass}
          />
        )}
      </Field>

      <div className="flex items-center justify-between gap-2">
        <span className="text-sm">{t("bodyLabel")}</span>
        <Button type="button" onClick={() => setPreview((p) => !p)}>
          {preview ? t("edit") : t("preview")}
        </Button>
      </div>
      {preview ? (
        <div className="rounded-card border border-border bg-bg p-4">
          <LegalMarkdown body={current.body} />
        </div>
      ) : (
        <textarea
          aria-label={t("bodyLabel")}
          value={current.body}
          maxLength={LEGAL_BODY_MAX}
          rows={20}
          onChange={(e) => setTexts((x) => ({ ...x, [locale]: { ...x[locale], body: e.target.value } }))}
          className={`${textareaClass} min-h-80 text-sm leading-relaxed`}
        />
      )}
      <p className="text-xs text-text-muted">{t("markdownHint")}</p>

      {message && (
        <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-text-muted" : "text-shu"}`}>
          {message.text}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={pending} onClick={save}>
          {t("saveDraft", { locale: t(`locales.${locale}`), version })}
        </Button>
        {draftVersion !== null && (
          <ConfirmAction
            label={t("publish", { version: draftVersion })}
            title={t("publishTitle", { version: draftVersion })}
            description={<p>{t("publishBody")}</p>}
            confirmLabel={t("publishConfirm")}
            onConfirm={async () => {
              const r = await publishLegalAction({ slug, version: draftVersion, forceReaccept });
              if (r.ok) router.refresh();
              return errorText(r);
            }}
          >
            {slug === "cgu" && (
              <label className="flex min-h-11 items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={forceReaccept}
                  onChange={(e) => setForceReaccept(e.target.checked)}
                  className="mt-0.5 choice shrink-0 "
                />
                <span>{t("forceReaccept")}</span>
              </label>
            )}
          </ConfirmAction>
        )}
      </div>
    </div>
  );
}
