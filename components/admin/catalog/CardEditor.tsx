"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { deleteCatalogCard, saveCatalogCard, setCatalogCardStatus } from "@/server/actions/admin-catalog";
import type { CardDraft } from "@/lib/catalog/admin-form";
import type { CatalogScope } from "@/lib/admin/roles";
import type { OddsScenario } from "@/lib/catalog/card-odds";
import { CARD_IMAGE_LIMIT, CARD_IMAGE_TYPES } from "@/lib/catalog/media";
import { localize, parseLocalized } from "@/lib/boosters/types";
import type { CatalogEditorOptions, LinkedCard } from "@/server/catalog/admin-queries";
import { Field, TextField, SelectField, NumberField, OptionalNumberField, inputClass } from "../fields";
import { AppearanceFields, ImageFramingFields } from "./AppearanceFields";
import { CardPreview } from "./CardPreview";
import { SearchPicker, type PickerValue } from "./SearchPicker";
import { Fuda } from "@/components/fuda/Fuda";
import { Sheet } from "@/components/ui/Sheet";

type Context = { series: { id: string; titleRomaji: string } | null; base: LinkedCard | null; variants: LinkedCard[]; editable: boolean; deletable: boolean };
type Odds = { id: string; name: unknown; slug: string; eligible: boolean; perSlot: number[]; atLeast: number };
async function optimizeImage(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error("IMAGE_INVALID")), "image/webp", 0.88));
    return new File([blob], "card.webp", { type: "image/webp" });
  } finally { bitmap.close(); }
}

const withImage = (card: LinkedCard) => ({ ...card, imageUrl: card.imageUrl || "/icons/icon-512.png" });

function Section({ id, title, children, highlight = false }: { id: string; title: string; children: ReactNode; highlight?: boolean }) {
  return <details id={id} open className={`group scroll-mt-4 rounded-card border bg-surface p-5 ${highlight ? "border-kin" : "border-border"}`}>
    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-title text-xl font-bold">{title}<span aria-hidden="true" className="text-sm text-text-muted transition-transform group-open:rotate-180">▾</span></summary>
    <div className="mt-4">{children}</div>
  </details>;
}

/** `drafts` (DEV) : brouillon seulement, l'admin publie ; une carte publiée ou distribuée s'ouvre en lecture seule. */
export function CardEditor({ scope, initial, options, context }: { scope: CatalogScope; initial: CardDraft; options: CatalogEditorOptions; context: Context }) {
  const t = useTranslations("admin.catalog"), tr = useTranslations("rarity"), locale = useLocale();
  const router = useRouter(); const [draft, setDraft] = useState(initial);
  const [baseline, setBaseline] = useState(JSON.stringify(initial));
  const [file, setFile] = useState<File | null>(null), [localImage, setLocalImage] = useState("");
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition(); const [scenario, setScenario] = useState<OddsScenario>("normal");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [featuredPity, setFeaturedPity] = useState(false), [odds, setOdds] = useState<Odds[]>([]), [oddsError, setOddsError] = useState(false);
  const [series, setSeries] = useState<PickerValue>(context.series ? { id: context.series.id, label: context.series.titleRomaji } : null);
  const [base, setBase] = useState<PickerValue>(context.base ? { id: context.base.id, label: context.base.name } : null);
  const dirty = JSON.stringify(draft) !== baseline || Boolean(file);
  const update = (value: Partial<CardDraft>) => { setDraft((d) => ({ ...d, ...value })); setNotice(""); };
  const fileInput = useRef<HTMLInputElement>(null), form = useRef<HTMLFormElement>(null), alert = useRef<HTMLParagraphElement>(null);
  const uploaded = useRef<{ file: File; url: string } | null>(null);
  const rarity = options.rarities.find((r) => r.key === draft.rarity);
  const variantRequired = Boolean(rarity?.variantRequired);
  const variantRarities = options.rarities.filter((r) => r.variantRequired);
  const median = options.medians[draft.rarity];
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    // Object URLs are never persisted and are released when replacing the image.
    const timer = setTimeout(() => setLocalImage(url), 0);
    return () => { clearTimeout(timer); URL.revokeObjectURL(url); };
  }, [file]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    const navigate = (e: MouseEvent) => { const anchor = (e.target as Element).closest?.("a[href]");
      if (anchor && !anchor.getAttribute("href")?.startsWith("#") && !window.confirm(t("unsavedLeave"))) { e.preventDefault(); e.stopPropagation(); } };
    window.addEventListener("beforeunload", unload); document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [dirty, t]);
  useEffect(() => {
    // Ctrl/Cmd + S enregistre sans quitter la page.
    const save = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); form.current?.requestSubmit(); } };
    window.addEventListener("keydown", save); return () => window.removeEventListener("keydown", save);
  }, []);
  useEffect(() => { if (error) alert.current?.focus(); }, [error]);
  const previewPayload = JSON.stringify({ id: draft.id, rarity: draft.rarity, dropWeight: draft.dropWeight, boosterIds: draft.boosterIds,
    variantOfId: draft.variantOfId, boosterExclusive: draft.boosterExclusive,
    scenario, featuredPity, seriesId: draft.seriesId, newSeries: draft.newSeries, gender: draft.gender, role: draft.role, birthMonth: draft.birthMonth, birthDay: draft.birthDay });
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try { const response = await fetch("/api/admin/catalogue/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: previewPayload, signal: controller.signal });
        if (!response.ok) throw new Error(); const value = await response.json() as Odds[]; if (!controller.signal.aborted) { setOdds(value); setOddsError(false); } }
      catch { if (!controller.signal.aborted) setOddsError(true); }
    }, 700); // une saisie, pas chaque frappe : chaque aperçu recalcule les pools de tous les boosters
    return () => { clearTimeout(timer); controller.abort(); };
  }, [previewPayload]);
  function selectFile(value: File | undefined) {
    if (!value || pending) return;
    if (!CARD_IMAGE_TYPES.includes(value.type) || value.size > CARD_IMAGE_LIMIT || !value.size) { setError(t("errors.IMAGE_INVALID")); return; }
    setFile(value); setError(""); setNotice("");
  }
  function save(status: CardDraft["status"]) {
    setError(""); setNotice("");
    startTransition(async () => {
      try {
        let imageUrl = draft.imageUrl;
        if (file) {
          if (uploaded.current?.file === file) imageUrl = uploaded.current.url;
          else {
            const optimized = await optimizeImage(file); const data = new FormData(); data.set("file", optimized);
            const response = await fetch("/api/admin/catalogue/upload", { method: "POST", body: data });
            const result = await response.json() as { url?: string; error?: string };
            if (!response.ok || !result.url) { setError(t.has(`errors.${result.error}` as "errors.UPLOAD_FAILED") ? t(`errors.${result.error}` as "errors.UPLOAD_FAILED") : t("errors.UPLOAD_FAILED")); return; }
            imageUrl = result.url; uploaded.current = { file, url: imageUrl };
          }
        }
        const payload = { ...draft, imageUrl, status, newSeries: draft.newSeries ? { ...draft.newSeries, genres: draft.newSeries.genres.filter(Boolean), tags: draft.newSeries.tags.filter(Boolean) } : null };
        const result = await saveCatalogCard(payload);
        if (!result.ok) { setError(`${t(`errors.${result.error}`)}${result.fields?.length ? ` (${result.fields.join(", ")})` : ""}`); return; }
        const saved = { ...payload, id: result.id, updatedAt: result.updatedAt, seriesId: result.seriesId ?? payload.seriesId, newSeries: result.seriesId ? null : payload.newSeries };
        if (draft.newSeries && result.seriesId) setSeries({ id: result.seriesId, label: draft.newSeries.title });
        setDraft(saved); setBaseline(JSON.stringify(saved)); setFile(null); setLocalImage(""); setNotice(t("saved"));
        if (!draft.id) router.replace(`/admin/catalogue/${result.id}`); else router.refresh();
      } catch { setError(t("errors.SAVE_FAILED")); }
    });
  }
  function archive() {
    if (!draft.id || !draft.updatedAt || !window.confirm(t(draft.status === "ARCHIVED" ? "restoreConfirm" : "archiveConfirm"))) return;
    startTransition(async () => {
      try {
        const result = await setCatalogCardStatus({ id: draft.id, updatedAt: draft.updatedAt, status: draft.status === "ARCHIVED" ? "DRAFT" : "ARCHIVED" });
        if (!result.ok) { setError(t(`errors.${result.error}`)); return; }
        const saved = { ...draft, status: draft.status === "ARCHIVED" ? "DRAFT" as const : "ARCHIVED" as const, updatedAt: result.updatedAt };
        setDraft(saved); setBaseline(JSON.stringify(saved)); setFile(null); setLocalImage(""); setNotice(t("saved")); router.refresh();
      } catch { setError(t("errors.SAVE_FAILED")); }
    });
  }
  function remove() {
    if (!draft.id || !draft.updatedAt || !window.confirm(t("deleteConfirm", { name: draft.name }))) return;
    startTransition(async () => {
      try {
        const result = await deleteCatalogCard({ id: draft.id, updatedAt: draft.updatedAt });
        if (!result.ok) { setError(t(`errors.${result.error}`)); return; }
        setBaseline(JSON.stringify(draft)); setFile(null); router.replace("/admin/catalogue");
      } catch { setError(t("errors.SAVE_FAILED")); }
    });
  }
  const seriesName = draft.newSeries?.title || series?.label || "";
  const appearanceDefaults = rarity?.appearance;
  const sections = [["info", t("information")], ...(variantRequired || draft.variantOfId ? [["variant", t("variant")]] : []), ["image", t("image")], ["appearance", t("appearance")], ["animations", t("animations")], ["distribution", t("distribution")]] as const;
  return <form ref={form} onSubmit={(e) => { e.preventDefault(); save(draft.status); }} className="flex min-w-0 flex-col gap-5">
    <fieldset disabled={pending || !context.editable} aria-busy={pending} className="contents">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><Link href="/admin/catalogue" className="text-sm text-link underline">{t("back")}</Link><h2 className="mt-2 font-heading text-3xl font-bold">{t(draft.id ? "edit" : draft.variantOfId ? "createVariant" : "create")}</h2></div><span role="status" className="rounded-pill border border-border px-3 py-2 text-xs">{t(`statuses.${draft.status}`)}{dirty ? ` · ${t("unsaved")}` : ""}</span></header>
    {scope === "drafts" && <p role="status" className="rounded-control border border-border bg-surface-2 p-3 text-sm text-text-muted">{t(context.editable ? "devReviewNote" : "devReadOnly")}</p>}
    <nav aria-label={t("sections")} className="-mx-1 flex gap-1 overflow-x-auto pb-1">{sections.map(([id, label]) => <a key={id} href={`#${id}`} className="inline-flex min-h-11 shrink-0 items-center rounded-pill border border-border px-3 text-xs">{label}</a>)}</nav>
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-5">
        <Section id="info" title={t("information")}><div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t("name")} value={draft.name} maxLength={200} onChange={(name) => update({ name })} />
          <TextField label={t("nameNative")} value={draft.nameNative || ""} maxLength={200} onChange={(nameNative) => update({ nameNative })} />
          <SelectField label={t("rarity")} value={draft.rarity} onChange={(rarity) => update({ rarity })} options={options.rarities.map((r) => ({ value: r.key, label: `${r.seal} ${locale === "en" ? r.nameEn || r.nameFr : r.nameFr}` }))} />
          {scope === "full" && <div className="flex items-end"><Link href="/admin/catalogue/raretes" className="flex min-h-11 items-center text-sm text-link underline">{t("manageRarities")}</Link></div>}
          <NumberField label={t("power")} value={draft.power} min={0} max={999} onChange={(power) => update({ power })} />
          <NumberField label={t("ki")} value={draft.ki} min={0} max={999} onChange={(ki) => update({ ki })} />
          {median && <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted sm:col-span-2"><span>{t("statsMedian", { rarity: tr(draft.rarity), power: median.power, ki: median.ki })}</span>
            <button type="button" className="min-h-11 rounded-control border border-border px-3 font-bold text-text" onClick={() => update({ power: median.power, ki: median.ki })}>{t("suggestStats")}</button></div>}
          {(["fr", "en"] as const).map((language) => <Field key={language} label={t(language === "fr" ? "descriptionFr" : "descriptionEn")}>{(id) => <textarea id={id} className={`${inputClass} min-h-28`} maxLength={20_000} value={draft.description[language]} onChange={(e) => update({ description: { ...draft.description, [language]: e.target.value } })} />}</Field>)}
          {draft.newSeries ? <div className="grid gap-3 rounded-control border border-border p-3 sm:col-span-2">
            <div className="flex items-center justify-between gap-2"><strong className="text-sm">{t("newSeries")}</strong><button type="button" className="min-h-11 text-xs text-link underline" onClick={() => update({ newSeries: null, seriesId: series?.id ?? null })}>{t("existingSeries")}</button></div>
            <TextField label={t("seriesTitle")} value={draft.newSeries.title} maxLength={300} onChange={(title) => update({ newSeries: { ...draft.newSeries!, title } })} />
            <TextField label={t("seriesTitleEn")} value={draft.newSeries.titleEnglish} maxLength={300} onChange={(titleEnglish) => update({ newSeries: { ...draft.newSeries!, titleEnglish } })} />
            <SelectField label={t("mediaType")} value={draft.newSeries.type} onChange={(type) => update({ newSeries: { ...draft.newSeries!, type } })} options={["CUSTOM", "ANIME", "MANGA"].map((v) => ({ value: v as "CUSTOM" | "ANIME" | "MANGA", label: v }))} />
            {(["genres", "tags"] as const).map((key) => <TextField key={key} label={t(key)} value={draft.newSeries![key].join(", ")} maxLength={1000} onChange={(raw) => update({ newSeries: { ...draft.newSeries!, [key]: raw.split(",").map((s) => s.trim()) } })} />)}
            <OptionalNumberField label={t("year")} value={draft.newSeries.year ?? null} min={1900} max={2100} onChange={(year) => update({ newSeries: { ...draft.newSeries!, year } })} />
            <TextField label={t("studio")} value={draft.newSeries.studio || ""} maxLength={200} onChange={(studio) => update({ newSeries: { ...draft.newSeries!, studio } })} />
            <SelectField label={t("season")} value={draft.newSeries.season || ""} onChange={(season) => update({ newSeries: { ...draft.newSeries!, season: season as "WINTER" | "SPRING" | "SUMMER" | "FALL" || null } })} options={["", "WINTER", "SPRING", "SUMMER", "FALL"].map((v) => ({ value: v, label: v || "—" }))} />
            <OptionalNumberField label={t("seasonYear")} value={draft.newSeries.seasonYear ?? null} min={1900} max={2100} onChange={(seasonYear) => update({ newSeries: { ...draft.newSeries!, seasonYear } })} />
          </div> : <div className="grid gap-1 sm:col-span-2">
            <SearchPicker kind="series" label={t("series")} required value={series} onChange={(value) => { setSeries(value); update({ seriesId: value?.id ?? null }); }} />
            <button type="button" className="min-h-11 self-start text-xs text-link underline" onClick={() => update({ seriesId: null, newSeries: { title: "", titleEnglish: "", type: "CUSTOM", genres: [], tags: [] } })}>{t("newSeries")}</button>
          </div>}
        </div><details className="mt-4"><summary className="min-h-11 cursor-pointer text-sm font-bold">{t("metadata")}</summary><div className="grid gap-4 sm:grid-cols-2">
          <SelectField label={t("gender")} value={draft.gender || ""} onChange={(gender) => update({ gender: gender || null })} options={[{ value: "", label: "—" }, { value: "Female", label: t("female") }, { value: "Male", label: t("male") }]} />
          <SelectField label={t("role")} value={draft.role || ""} onChange={(role) => update({ role: role as CardDraft["role"] || null })} options={["", "MAIN", "SUPPORTING", "BACKGROUND"].map((v) => ({ value: v, label: v || "—" }))} />
          <OptionalNumberField label={t("birthMonth")} value={draft.birthMonth} min={1} max={12} onChange={(birthMonth) => update({ birthMonth })} /><OptionalNumberField label={t("birthDay")} value={draft.birthDay} min={1} max={31} onChange={(birthDay) => update({ birthDay })} />
        </div></details></Section>
        {(variantRequired || draft.variantOfId) && <Section id="variant" title={t("variant")} highlight={variantRequired}>
          <p className="mb-4 text-sm text-text-muted">{t(variantRequired ? "variantRequiredHint" : "variantHint", { rarity: tr(draft.rarity) })}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <SearchPicker kind="card" label={t("variantOf")} required={variantRequired} value={base} onChange={(value) => { setBase(value); update({ variantOfId: value?.id ?? null }); }} />
            <TextField label={t("formName")} hint={t("formNameHint")} value={draft.formName || ""} maxLength={120} onChange={(formName) => update({ formName: formName || null })} />
          </div>
          {context.base && base?.id === context.base.id && <div className="mt-4 flex items-center gap-3"><div className="w-20 shrink-0"><Fuda card={withImage(context.base)} size="sm" tilt={false} /></div>
            <Link href={`/admin/catalogue/${context.base.id}`} className="inline-flex min-h-11 items-center text-sm text-link underline">{t("openBase", { name: context.base.name })}</Link></div>}
        </Section>}
        <Section id="image" title={t("image")}>
          {!options.storageConfigured && <p role="status" className="mb-3 text-sm text-shu">{t("storageSetup")}</p>}
          {variantRequired && <p className="mb-3 text-sm text-kin">{t("variantImageHint")}</p>}
          <div className="flex min-h-32 items-center justify-center rounded-control border-2 border-dashed border-border bg-surface-2 p-4 text-center" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); selectFile(e.dataTransfer.files[0]); }}>
            <label className="cursor-pointer"><span className="block font-bold">{file?.name || t("dropImage")}</span><span className="mt-1 block text-xs text-text-muted">{t("imageHint")}</span><input ref={fileInput} type="file" accept={CARD_IMAGE_TYPES.join(",")} className="mt-3 block w-full text-sm" onChange={(e) => selectFile(e.target.files?.[0])} /></label>
          </div><div className="mt-4"><ImageFramingFields value={draft.appearance} onChange={(appearance) => update({ appearance })} /></div>
        </Section>
        <Section id="appearance" title={t("appearance")}><AppearanceFields value={draft.appearance} defaults={appearanceDefaults} onChange={(appearance) => update({ appearance })} /></Section>
        <Section id="animations" title={t("animations")}><AppearanceFields animation value={draft.appearance} defaults={appearanceDefaults} onChange={(appearance) => update({ appearance })} /></Section>
        <Section id="distribution" title={t("distribution")}>
          <NumberField label={t("dropWeight")} hint={t("weightHint")} value={draft.dropWeight} min={0} max={1_000_000} onChange={(dropWeight) => update({ dropWeight })} />
          {draft.variantOfId && <label className="mt-4 flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="mt-1 size-5" checked={draft.boosterExclusive} onChange={(e) => update({ boosterExclusive: e.target.checked })} /><span><span className="font-bold">{t("boosterExclusive")}</span><span className="block text-xs text-text-muted">{t(draft.boosterExclusive ? "boosterExclusiveOn" : "boosterExclusiveOff")}</span></span></label>}
          <fieldset className="mt-4"><legend className="mb-2 text-sm font-bold">{t(draft.variantOfId && !draft.boosterExclusive ? "boostersExtra" : "boosters")}</legend><div className="grid max-h-72 gap-1 overflow-y-auto sm:grid-cols-2">{options.boosters.map((b) => <label key={b.id} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={draft.boosterIds.includes(b.id)} onChange={(e) => update({ boosterIds: e.target.checked ? [...draft.boosterIds, b.id] : draft.boosterIds.filter((id) => id !== b.id) })} />{localize(parseLocalized(b.name, b.slug), locale)}{!b.active && ` (${t("inactive")})`}</label>)}</div></fieldset>
          <div className="mt-5 border-t border-border pt-4"><h4 className="mb-3 font-bold">{t("odds")}</h4><SelectField label={t("scenario")} value={scenario} onChange={setScenario} options={["normal", "golden", "divine", "pity"].map((v) => ({ value: v as OddsScenario, label: t(v as "normal") }))} />
            <label className="mt-3 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={featuredPity} onChange={(e) => setFeaturedPity(e.target.checked)} />{t("featuredPity")}</label>
            <p className="mt-2 text-xs text-text-muted">{t("oddsHint")}</p>
            {oddsError ? <p role="status" className="mt-3 text-sm text-shu">{t("oddsError")}</p> : !odds.length ? <p className="mt-3 text-sm text-text-muted">{t("noBoosters")}</p> : <ul className="mt-4 grid gap-3">{odds.map((o) => <li key={o.id} className="rounded-control border border-border p-3 text-sm"><div className="flex justify-between gap-3"><strong>{localize(parseLocalized(o.name, o.slug), locale)}</strong><span className="tabular-nums">{(o.atLeast * 100).toLocaleString(locale, { maximumFractionDigits: 5 })}%</span></div><p className="mt-1 text-xs text-text-muted">{o.perSlot.map((p, i) => `${i + 1}: ${(p * 100).toLocaleString(locale, { maximumFractionDigits: 4 })}%`).join(" · ")}</p></li>)}</ul>}
          </div>
        </Section>
        {draft.id && !draft.variantOfId && (variantRarities.length > 0 || context.variants.length > 0) && <section className="rounded-card border border-border bg-surface p-5"><h3 className="mb-2 font-title text-xl font-bold">{t("variants")}</h3>
          <p className="mb-4 text-sm text-text-muted">{t("variantsHint")}</p>
          {context.variants.length > 0 && <ul className="mb-4 grid grid-cols-3 gap-3 sm:grid-cols-4">{context.variants.map((v) => <li key={v.id}><Link href={`/admin/catalogue/${v.id}`} className="block"><Fuda card={withImage(v)} size="sm" tilt={false} /><span className="mt-1 block truncate text-xs">{v.formName || tr(v.rarity)} · {t(`statuses.${v.status}`)}</span></Link></li>)}</ul>}
          <div className="flex flex-wrap gap-2">{variantRarities.map((r) => <Link key={r.key} href={`/admin/catalogue/nouvelle?variantOf=${draft.id}&rarity=${r.key}`} className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border px-3 text-sm font-bold"><span className="font-seal">{r.seal}</span>{t("createVariantOf", { rarity: tr(r.key) })}</Link>)}</div>
        </section>}
      </div>
      <div className="hidden self-start lg:sticky lg:top-4 lg:block"><CardPreview draft={draft} series={seriesName} imageUrl={localImage} /></div>
    </div>
    <div className="sticky bottom-0 z-20 flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-4 shadow-lg">
      {error && <p ref={alert} tabIndex={-1} role="alert" className="w-full break-words text-sm text-shu">{error}</p>}{notice && <p role="status" className="w-full text-sm">{notice}</p>}
      <button type="submit" disabled={pending} className="min-h-11 rounded-control border border-border px-4 font-bold disabled:opacity-50" title={t("saveShortcut")}>{pending ? t("saving") : t(draft.id ? "save" : "saveDraft")}</button>
      <button type="button" className="min-h-11 rounded-control border border-border px-3 text-sm lg:hidden" onClick={() => setPreviewOpen(true)}>{t("preview")}</button>
      {scope === "full" && draft.status !== "PUBLISHED" && <button type="button" disabled={pending} onClick={() => save("PUBLISHED")} className="min-h-11 rounded-control bg-shu-btn px-4 font-bold text-white disabled:opacity-50">{t("publish")}</button>}
      {scope === "full" && draft.id && <button type="button" disabled={pending || dirty} onClick={archive} className="min-h-11 px-3 text-sm text-shu underline disabled:opacity-50">{t(draft.status === "ARCHIVED" ? "restore" : "archive")}</button>}
      {draft.id && context.deletable && <button type="button" disabled={pending} onClick={remove} className="min-h-11 px-3 text-sm text-shu underline disabled:opacity-50">{t("delete")}</button>}
      <span className="ml-auto text-xs text-text-muted">{tr(draft.rarity)}</span>
    </div>
    {previewOpen && <Sheet open onClose={() => setPreviewOpen(false)} title={t("preview")}><CardPreview draft={draft} series={seriesName} imageUrl={localImage} /></Sheet>}
    </fieldset>
  </form>;
}
