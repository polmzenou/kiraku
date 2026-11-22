"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { parseKyaraProfileUrl } from "@/lib/kyara/profile-url";
import { requestKyaraImportAction, type KyaraImportActionError } from "@/server/actions/kyara-import";
import { Button } from "../ui/Button";
import { inputClass } from "../ui/Field";

/** Demande d'import : l'adresse du profil public Kyara, vérifiée ici puis revérifiée par le serveur. */
export function KyaraRequestForm() {
  const t = useTranslations("kyaraImport.form");
  const tError = useTranslations("kyaraImport.errors");
  const id = useId();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<KyaraImportActionError | null>(null);
  const [pending, start] = useTransition();
  const valid = parseKyaraProfileUrl(url) !== null;

  const submit = () => {
    if (!valid) return setError("INVALID");
    if (!window.confirm(t("confirm"))) return;
    setError(null);
    start(async () => {
      try {
        const res = await requestKyaraImportAction({ profileUrl: url });
        if (!res.ok) setError(res.error);
      } catch {
        setError("UNAVAILABLE");
      }
    });
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor={id} className="text-sm font-bold">
        {t("label")}
      </label>
      <input
        id={id}
        type="url"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        placeholder={t("placeholder")}
        value={url}
        onChange={(e) => {
          setUrl(e.target.value);
          setError(null);
        }}
        aria-invalid={error !== null || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={inputClass}
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm font-bold text-shu">
          {tError(error)}
        </p>
      )}
      <Button type="submit" variant="primary" disabled={pending || url.trim() === ""} className="w-full sm:w-fit">
        {pending ? t("pending") : t("submit")}
      </Button>
    </form>
  );
}
