"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { createFrescoAction } from "@/server/actions/admin-fresco";
import { Button } from "../../ui/Button";
import { TextField } from "../fields";

/** Nouvelle fresque : un nom, puis l'éditeur (image, lots, chute) s'ouvre sur le brouillon. */
export function CreateFrescoForm() {
  const t = useTranslations("admin.frescoes");
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const submit = () =>
    startTransition(async () => {
      setError(null);
      const res = await createFrescoAction({ name: name.trim() }).catch(() => ({ ok: false as const, error: "UNAVAILABLE" as const }));
      if (!res.ok) return setError(t.has(`editor.errors.${res.error}` as "editor.errors.UNAVAILABLE") ? t(`editor.errors.${res.error}` as "editor.errors.UNAVAILABLE") : t("editor.errors.UNAVAILABLE"));
      router.push(`/admin/fresques/${res.id}`);
    });
  return (
    <form
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex-1">
        <TextField label={t("create.name")} value={name} maxLength={60} onChange={setName} />
      </div>
      <Button type="submit" variant="primary" disabled={pending || !name.trim()}>
        {t("create.submit")}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-shu">
          {error}
        </p>
      )}
    </form>
  );
}
