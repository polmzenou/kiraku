"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Fuda } from "@/components/fuda/Fuda";
import { bulkCatalogAction } from "@/server/actions/admin-catalog";
import { localize, parseLocalized } from "@/lib/boosters/types";
import { ADMIN_CATALOG_SORTS, ADMIN_CATALOG_STATUSES, adminCatalogHref, type AdminCatalogParams } from "@/lib/catalog/admin-list";
import type { BULK_ACTIONS } from "@/lib/catalog/admin-form";
import type { RarityDefinition } from "@/lib/catalog/definitions";
import type { CatalogScope } from "@/lib/admin/roles";
import type { adminCatalogList } from "@/server/catalog/admin-queries";
import { CatalogStatusButton } from "./CatalogStatusButton";
import { SearchPicker, type PickerValue } from "./SearchPicker";

type Data = Awaited<ReturnType<typeof adminCatalogList>>;
type Action = (typeof BULK_ACTIONS)[number];
const control = "min-h-11 min-w-0 rounded-control border border-border bg-surface px-3 text-sm";

/** `drafts` (DEV) : ni actions groupées ni archivage, suppression d'un brouillon seulement. */
export function CatalogList({ scope, data, rarities, boosters, series }: {
  scope: CatalogScope; data: Data; rarities: RarityDefinition[]; boosters: { id: string; slug: string; name: unknown }[]; series: PickerValue;
}) {
  const t = useTranslations("admin.catalog"), tr = useTranslations("rarity"), locale = useLocale(), router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [action, setAction] = useState<Action>("publish"), [rarity, setRarity] = useState(rarities[0]?.key ?? ""), [booster, setBooster] = useState(boosters[0]?.id ?? "");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const filters = data.filters;
  const go = (patch: Partial<AdminCatalogParams>) => { setSelected([]); router.replace(adminCatalogHref(filters, patch)); };
  const pageIds = data.cards.map((c) => c.id), allSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));
  const total = Object.values(data.counts).reduce((s, n) => s + (n ?? 0), 0);
  const full = scope === "full";
  function runBulk() {
    if (!selected.length || !window.confirm(t("bulkConfirm", { count: selected.length, action: t(`bulk.${action}`) }))) return;
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await bulkCatalogAction({ ids: selected, action, ...(action === "setRarity" && { rarity }), ...((action === "addBooster" || action === "removeBooster") && { boosterId: booster }) });
        if (!result.ok) { setMessage({ tone: "error", text: t(`errors.${result.error}`) }); return; }
        const reasons = [...new Set(result.rejected.map((r) => t(`errors.${r.error}`)))].join(" · ");
        setMessage({ tone: result.rejected.length ? "error" : "ok", text: `${t("bulkDone", { count: result.updated })}${result.rejected.length ? ` ${t("bulkRejected", { count: result.rejected.length })} ${reasons}` : ""}` });
        setSelected(result.rejected.map((r) => r.id)); router.refresh();
      } catch { setMessage({ tone: "error", text: t("errors.SAVE_FAILED") }); }
    });
  }
  return <>
    <form method="get" className="grid gap-3 rounded-card border border-border bg-surface-2 p-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => { e.preventDefault(); const form = new FormData(e.currentTarget); go({ q: String(form.get("q") ?? "").slice(0, 200) }); }}>
      <label className="grid gap-1 text-xs">{t("search")}<input className={control} name="q" type="search" maxLength={200} defaultValue={filters.q} placeholder={t("searchPlaceholder")} /></label>
      <label className="grid gap-1 text-xs">{t("rarity")}<select className={control} name="rarity" value={filters.rarity} onChange={(e) => go({ rarity: e.target.value })}><option value="">{t("all")}</option>{rarities.map((r) => <option key={r.key} value={r.key}>{r.seal} {tr(r.key)}</option>)}</select></label>
      <div className="text-xs"><SearchPicker kind="series" label={t("series")} name="series" value={series} onChange={(value) => go({ series: value?.id ?? "" })} /></div>
      <label className="grid gap-1 text-xs">{t("origin")}<select className={control} name="origin" value={filters.origin} onChange={(e) => go({ origin: e.target.value as AdminCatalogParams["origin"] })}><option value="">{t("all")}</option><option value="ANILIST">AniList</option><option value="CUSTOM">{t("custom")}</option></select></label>
      <label className="grid gap-1 text-xs">{t("kind")}<select className={control} name="kind" value={filters.kind} onChange={(e) => go({ kind: e.target.value as AdminCatalogParams["kind"] })}><option value="">{t("all")}</option><option value="bases">{t("kinds.bases")}</option><option value="variants">{t("kinds.variants")}</option></select></label>
      <label className="grid gap-1 text-xs">{t("sort")}<select className={control} name="sort" value={filters.sort} onChange={(e) => go({ sort: e.target.value as AdminCatalogParams["sort"] })}>{ADMIN_CATALOG_SORTS.map((s) => <option key={s} value={s}>{t(`sorts.${s}`)}</option>)}</select></label>
      <input type="hidden" name="status" value={filters.status} />
      <button type="submit" className={`${control} self-end font-bold`}>{t("filter")}</button>
    </form>
    <nav aria-label={t("status")} className="-mx-1 flex gap-2 overflow-x-auto pb-1">
      {(["", ...ADMIN_CATALOG_STATUSES] as const).map((s) => <Link key={s || "all"} href={adminCatalogHref(filters, { status: s })} aria-current={filters.status === s ? "page" : undefined}
        className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-pill border px-4 text-sm ${filters.status === s ? "border-shu bg-shu-btn font-bold text-white" : "border-border"}`}>
        {s ? t(`statuses.${s}`) : t("all")}<span className="tabular-nums opacity-80">{s ? data.counts[s] ?? 0 : total}</span></Link>)}
    </nav>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-text-muted">{t("results", { count: data.total })}</p>
      {full && data.cards.length > 0 && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={allSelected} onChange={(e) => setSelected(e.target.checked ? [...new Set([...selected, ...pageIds])] : selected.filter((id) => !pageIds.includes(id)))} />{t("selectPage")}</label>}
    </div>
    {!data.cards.length ? <p className="rounded-card border border-dashed border-border p-8 text-center text-text-muted">{t("empty")}</p> : <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.cards.map((c) => {
      const checked = selected.includes(c.id);
      return <li key={c.id} className={`flex gap-3 rounded-card border bg-surface p-3 ${checked ? "border-shu" : "border-border"}`}>
        {full && <label className="flex min-h-11 min-w-11 items-start justify-center pt-1"><input type="checkbox" checked={checked} aria-label={t("selectCard", { name: c.name })} onChange={(e) => setSelected(e.target.checked ? [...selected, c.id] : selected.filter((id) => id !== c.id))} /></label>}
        <Link href={`/admin/catalogue/${c.id}`} className="w-20 shrink-0" aria-hidden="true" tabIndex={-1}><Fuda card={{ ...c, imageUrl: c.imageUrl || "/icons/icon-512.png" }} size="sm" tilt={false} /></Link>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-title font-bold"><Link href={`/admin/catalogue/${c.id}`} className="hover:underline">{c.name}</Link></h3>
          <p className="truncate text-xs text-text-muted">{c.formName ? `${c.formName} · ` : ""}{c.series.titleRomaji}</p>
          <p className="mt-1 text-xs"><span className="font-seal">{rarities.find((r) => r.key === c.rarity)?.seal}</span> {tr(c.rarity)} · <span className="tabular-nums">{c.power} / {c.ki}</span> · #{c.publicId}</p>
          <p className="mt-1 flex flex-wrap gap-1 text-xs text-text-muted"><span className="rounded-pill border border-border px-2">{t(`statuses.${c.status}`)}</span><span className="rounded-pill border border-border px-2">{c.origin === "CUSTOM" ? t("custom") : "AniList"}</span>
            {c.variantOfId && <span className="rounded-pill border border-kin px-2 text-kin">{t("kinds.variant")}</span>}{c.variants > 0 && <span className="rounded-pill border border-border px-2">{t("variantCount", { count: c.variants })}</span>}
            <span className="rounded-pill border border-border px-2 tabular-nums">{t("ownedSummary", { owners: c.owners, copies: c.copies })}</span></p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3"><Link href={`/admin/catalogue/${c.id}`} className="inline-flex min-h-11 items-center text-xs text-link underline">{t("edit")}</Link><Link href={`/admin/catalogue/nouvelle?duplicate=${c.id}`} className="inline-flex min-h-11 items-center text-xs text-link underline">{t("duplicate")}</Link><CatalogStatusButton id={c.id} updatedAt={c.updatedAt} archived={c.status === "ARCHIVED"} deletable={c.deletable && (full || c.status === "DRAFT")} name={c.name} canArchive={full} /></div>
        </div>
      </li>;
    })}</ul>}
    <nav aria-label={t("pagination")} className="flex items-center justify-between gap-3">{data.page > 1 ? <Link className={`${control} inline-flex items-center`} href={adminCatalogHref(filters, { page: data.page - 1 })}>{t("previous")}</Link> : <span />}<span className="text-sm tabular-nums">{data.page} / {data.pages}</span>{data.page < data.pages ? <Link className={`${control} inline-flex items-center`} href={adminCatalogHref(filters, { page: data.page + 1 })}>{t("next")}</Link> : <span />}</nav>
    {(selected.length > 0 || message) && <div className="sticky bottom-0 z-20 flex flex-wrap items-end gap-3 rounded-card border border-border bg-surface p-4 shadow-lg">
      {message && <p role={message.tone === "error" ? "alert" : "status"} className={`w-full text-sm ${message.tone === "error" ? "text-shu" : ""}`}>{message.text}</p>}
      {selected.length > 0 && <>
        <p className="w-full text-sm font-bold sm:w-auto sm:self-center">{t("selected", { count: selected.length })}</p>
        <label className="grid gap-1 text-xs">{t("bulkAction")}<select className={control} value={action} onChange={(e) => setAction(e.target.value as Action)}>{(["publish", "archive", "restore", "setRarity", "addBooster", "removeBooster"] as const).map((a) => <option key={a} value={a}>{t(`bulk.${a}`)}</option>)}</select></label>
        {action === "setRarity" && <label className="grid gap-1 text-xs">{t("rarity")}<select className={control} value={rarity} onChange={(e) => setRarity(e.target.value)}>{rarities.map((r) => <option key={r.key} value={r.key}>{r.seal} {tr(r.key)}</option>)}</select></label>}
        {(action === "addBooster" || action === "removeBooster") && <label className="grid gap-1 text-xs">{t("booster")}<select className={control} value={booster} onChange={(e) => setBooster(e.target.value)}>{boosters.map((b) => <option key={b.id} value={b.id}>{localize(parseLocalized(b.name, b.slug), locale)}</option>)}</select></label>}
        <button type="button" disabled={pending} onClick={runBulk} className="min-h-11 rounded-control bg-shu-btn px-4 font-bold text-white disabled:opacity-50">{pending ? t("saving") : t("apply")}</button>
        <button type="button" disabled={pending} onClick={() => { setSelected([]); setMessage(null); }} className="min-h-11 px-3 text-sm underline">{t("clearSelection")}</button>
      </>}
    </div>}
  </>;
}
