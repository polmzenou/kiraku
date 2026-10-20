"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { RarityDraft } from "@/lib/catalog/admin-form";
import { blankCard } from "@/lib/catalog/admin-form";
import { materialAppearance } from "@/lib/catalog/appearance";
import { KEYWORDS } from "@/lib/battle/types";
import { saveCatalogRarity } from "@/server/actions/admin-catalog";
import { NumberField, SelectField, TextField } from "../fields";
import { AppearanceFields } from "./AppearanceFields";
import { CardPreview } from "./CardPreview";

export function RarityEditor({ initial, templates }: { initial: RarityDraft; templates: RarityDraft[] }) {
  const t = useTranslations("admin.catalog"), router = useRouter();
  const [draft, setDraft] = useState(initial), [pending, startTransition] = useTransition();
  const [error, setError] = useState(""), [saved, setSaved] = useState(false);
  const update = (v: Partial<RarityDraft>) => { setDraft((d) => ({ ...d, ...v })); setSaved(false); };
  const preview = { ...blankCard(), name: draft.nameFr || t("previewName"), rarity: draft.create ? draft.template : draft.key, appearance: { ...draft.appearance, seal: draft.seal }, imageUrl: "/icons/icon-512.png" };
  return <form className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]" onSubmit={(e) => { e.preventDefault(); setError(""); startTransition(async () => {
    try { const result = await saveCatalogRarity(draft);
      if (!result.ok) { setError(t(`errors.${result.error}`)); return; }
      setDraft({ ...draft, create: false, updatedAt: result.updatedAt }); setSaved(true); router.refresh();
      if (draft.create) router.replace(`/admin/catalogue/raretes?key=${encodeURIComponent(result.id)}`);
    } catch { setError(t("errors.SAVE_FAILED")); }
  }); }}>
    <fieldset disabled={pending} aria-busy={pending} className="contents"><div className="grid gap-5 rounded-card border border-border bg-surface p-5">
      <h3 className="font-title text-2xl font-bold">{t(draft.create ? "newRarity" : "editRarity")}</h3>
      {draft.create && <SelectField label={t("template")} value={draft.template} onChange={(key) => { const template = templates.find((v) => v.key === key)!; update({ ...template, appearance: { ...materialAppearance(key), ...template.appearance }, key: draft.key, nameFr: draft.nameFr, nameEn: draft.nameEn, create: true, updatedAt: undefined, template: key, sortOrder: draft.sortOrder, rate: 0 }); }} options={templates.map((v) => ({ value: v.key, label: v.nameFr }))} />}
      <div className="grid gap-4 sm:grid-cols-2">
        {draft.create ? <TextField label={t("rarityKey")} maxLength={40} value={draft.key} onChange={(key) => update({ key: key.toUpperCase() })} /> : <p className="text-sm text-text-muted">{t("rarityKey")} : {draft.key}</p>}
        <NumberField label={t("sortOrder")} min={-100_000} max={100_000} value={draft.sortOrder} onChange={(sortOrder) => update({ sortOrder })} />
        <TextField label={t("nameFr")} maxLength={80} value={draft.nameFr} onChange={(nameFr) => update({ nameFr })} /><TextField label={t("nameEn")} maxLength={80} value={draft.nameEn} onChange={(nameEn) => update({ nameEn })} />
        <TextField label={t("seal")} maxLength={8} value={draft.seal} onChange={(seal) => update({ seal })} />
        <NumberField label={t("rarityWeight")} min={0} max={1_000_000} value={draft.rate} onChange={(rate) => update({ rate })} />
        <NumberField label={t("recycleValue")} min={0} max={100_000} value={draft.recycleValue} onChange={(recycleValue) => update({ recycleValue })} />
        <NumberField label={t("keywords")} min={0} max={KEYWORDS.length} value={draft.keywords} onChange={(keywords) => update({ keywords })} />
        {(["gifts", "trades"] as const).map((key) => <label key={key} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={draft[key]} onChange={(e) => update({ [key]: e.target.checked })} />{t(key)}</label>)}
        <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={Boolean(draft.variantRequired)} onChange={(e) => update({ variantRequired: e.target.checked })} />{t("variantRequired")}</label>
      </div>
      <p className="text-xs text-text-muted">{t("rarityHint")}</p>
      {draft.variantRequired && <p className="text-xs text-text-muted">{t("variantRequiredRarityHint")}</p>}
      <h4 className="font-bold">{t("appearance")}</h4><AppearanceFields value={draft.appearance} onChange={(appearance) => update({ appearance })} />
      <h4 className="font-bold">{t("animations")}</h4><AppearanceFields animation value={draft.appearance} onChange={(appearance) => update({ appearance })} />
      {error && <p role="alert" className="text-sm text-shu">{error}</p>}{saved && <p role="status" className="text-sm">{t("saved")}</p>}
      <button type="submit" disabled={pending} className="min-h-11 rounded-control bg-shu-btn px-4 font-bold text-white disabled:opacity-50">{t(pending ? "saving" : "save")}</button>
    </div><CardPreview draft={preview} series={t("rarity")} /></fieldset>
  </form>;
}
