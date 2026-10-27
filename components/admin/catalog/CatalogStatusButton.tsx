"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { deleteCatalogCard, setCatalogCardStatus } from "@/server/actions/admin-catalog";

export function CatalogStatusButton({ id, updatedAt, archived, deletable = false, name = "", canArchive = true }: { id: string; updatedAt: string; archived: boolean; deletable?: boolean; name?: string; canArchive?: boolean }) {
  const t = useTranslations("admin.catalog"), router = useRouter();
  const [pending, startTransition] = useTransition(), [error, setError] = useState("");
  const run = (call: () => Promise<{ ok: true } | { ok: false; error: string }>) => startTransition(async () => {
    try { const result = await call(); if (!result.ok) setError(t(`errors.${result.error}` as "errors.SAVE_FAILED")); else router.refresh(); }
    catch { setError(t("errors.SAVE_FAILED")); }
  });
  return <div className="flex flex-wrap items-center gap-x-3">
    {canArchive && <button type="button" disabled={pending} className="min-h-11 text-xs text-shu underline disabled:opacity-50" onClick={() => {
      if (window.confirm(t(archived ? "restoreConfirm" : "archiveConfirm"))) run(() => setCatalogCardStatus({ id, updatedAt, status: archived ? "DRAFT" : "ARCHIVED" }));
    }}>{t(archived ? "restore" : "archive")}</button>}
    {deletable && <button type="button" disabled={pending} className="min-h-11 text-xs text-shu underline disabled:opacity-50" onClick={() => {
      if (window.confirm(t("deleteConfirm", { name }))) run(() => deleteCatalogCard({ id, updatedAt }));
    }}>{t("delete")}</button>}
    {error && <p role="alert" className="w-full max-w-52 text-xs text-shu">{error}</p>}
  </div>;
}
