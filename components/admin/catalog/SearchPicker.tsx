"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { inputClass } from "../fields";
import type { SearchOption } from "@/lib/catalog/admin-list";

export type PickerValue = { id: string; label: string } | null;

/**
 * Combobox de recherche (séries, cartes de base) : remplace les très longues listes déroulantes.
 * `name` ajoute un champ caché pour les formulaires GET (filtres de la liste).
 */
export function SearchPicker({ kind, label, value, onChange, name, hint, required = false }: {
  kind: "series" | "card"; label: string; value: PickerValue; onChange: (value: PickerValue) => void;
  name?: string; hint?: string; required?: boolean;
}) {
  const t = useTranslations("admin.catalog");
  const id = useId(), listId = `${id}-list`;
  const [query, setQuery] = useState(""), [open, setOpen] = useState(false);
  const [options, setOptions] = useState<SearchOption[]>([]), [active, setActive] = useState(0);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("loading");
      try {
        const response = await fetch(`/api/admin/catalogue/search?${new URLSearchParams({ kind, q: query })}`, { signal: controller.signal });
        if (!response.ok) throw new Error();
        const rows = await response.json() as SearchOption[];
        if (!controller.signal.aborted) { setOptions(rows); setActive(0); setStatus("idle"); }
      } catch { if (!controller.signal.aborted) setStatus("error"); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, query, kind]);
  const choose = (option: SearchOption) => { onChange({ id: option.id, label: option.label }); setOpen(false); setQuery(""); };
  return <div className="relative flex min-w-0 flex-col gap-1">
    <label htmlFor={id} className="text-sm">{label}{required && " *"}</label>
    {name && <input type="hidden" name={name} value={value?.id ?? ""} />}
    {value && !open ? <div className="flex min-h-11 items-center gap-2 rounded-control border border-border bg-surface px-3">
      <span className="min-w-0 flex-1 truncate text-sm">{value.label}</span>
      <button type="button" className="min-h-11 text-xs text-link underline" onClick={() => { setOpen(true); setTimeout(() => input.current?.focus(), 0); }}>{t("change")}</button>
      <button type="button" className="min-h-11 text-xs underline" aria-label={t("clearChoice", { label })} onClick={() => onChange(null)}>×</button>
    </div> : <input ref={input} id={id} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
      aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined} autoComplete="off"
      className={inputClass} value={query} maxLength={100} placeholder={t("searchPlaceholder")}
      onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
      onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(options.length - 1, i + 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
        else if (e.key === "Enter" && open && options[active]) { e.preventDefault(); choose(options[active]); }
        else if (e.key === "Escape") setOpen(false);
      }} />}
    {hint && <p className="text-xs text-text-muted">{hint}</p>}
    {open && <ul id={listId} role="listbox" aria-label={label} className="absolute top-full z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-control border border-border bg-surface shadow-lg">
      {status === "error" ? <li className="p-3 text-sm text-shu">{t("searchError")}</li>
        : !options.length ? <li className="p-3 text-sm text-text-muted">{status === "loading" ? t("searching") : t("noResults")}</li>
        : options.map((o, i) => <li key={o.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}
          className={`flex min-h-11 cursor-pointer items-center gap-2 px-3 py-1 text-sm ${i === active ? "bg-surface-2" : ""}`}
          onMouseDown={(e) => { e.preventDefault(); choose(o); }} onMouseEnter={() => setActive(i)}>
          {o.imageUrl && <span className="relative h-10 w-7 shrink-0 overflow-hidden rounded-[4px] bg-surface-2"><Image src={o.imageUrl} alt="" fill sizes="28px" className="object-cover object-top" /></span>}
          <span className="min-w-0"><span className="block truncate">{o.label}</span>{o.detail && <span className="block truncate text-xs text-text-muted">{o.detail}</span>}</span>
        </li>)}
    </ul>}
  </div>;
}
