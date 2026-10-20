"use client";

import { useTranslations } from "next-intl";
import { APPEARANCE_DEFAULTS, EFFECTS, type CardAppearance } from "@/lib/catalog/appearance";
import { Field, inputClass, SelectField, TextField } from "../fields";

export function AppearanceFields({ value, defaults, onChange, animation = false }: { value: CardAppearance; defaults?: CardAppearance; onChange: (v: CardAppearance) => void; animation?: boolean }) {
  const t = useTranslations("admin.catalog");
  const displayed = { ...defaults, ...value };
  const set = (v: Partial<CardAppearance>) => onChange({ ...value, ...v });
  const range = (key: "focalX" | "focalY" | "zoom" | "intensity" | "speed" | "tilt" | "duration" | "delay", min: number, max: number, step: number) => (
    <Field key={key} label={`${t(key)} · ${displayed[key] ?? APPEARANCE_DEFAULTS[key]}`}>
      {(id) => <input id={id} type="range" className="min-h-11 w-full accent-shu" min={min} max={max} step={step} value={displayed[key] ?? APPEARANCE_DEFAULTS[key]} onChange={(e) => set({ [key]: e.target.valueAsNumber })} />}
    </Field>
  );
  return <div className="grid gap-4 sm:grid-cols-2">
    {animation ? <>
      {range("tilt", 0, 30, 1)}
      <SelectField label={t("reveal")} value={displayed.reveal ?? "flip"} onChange={(reveal) => set({ reveal })} options={(["flip", "fade", "zoom"] as const).map((v) => ({ value: v as "flip" | "fade" | "zoom", label: t(v) }))} />
      {range("duration", 0.1, 3, 0.1)}{range("delay", 0, 3, 0.1)}
      <SelectField label={t("easing")} value={displayed.easing ?? "easeOut"} onChange={(easing) => set({ easing })} options={(["easeOut", "easeInOut", "linear"] as const).map((v) => ({ value: v as "easeOut" | "easeInOut" | "linear", label: t(v) }))} />
    </> : <>
      {(["frame", "paper", "ink", "effectColor"] as const).map((key) => <Field key={key} label={t(key)}>
        {(id) => <div className="flex gap-2"><input id={id} type="color" value={displayed[key] ?? (key === "ink" ? "#241e1a" : key === "paper" ? "#f4ede0" : "#c8a35b")} onChange={(e) => set({ [key]: e.target.value })} className="h-11 w-16 rounded-control border border-border" /><button type="button" className="text-xs underline" onClick={() => { const next = { ...value }; delete next[key]; onChange(next); }}>{t("inherit")}</button></div>}
      </Field>)}
      <TextField label={t("seal")} maxLength={8} value={value.seal ?? ""} onChange={(seal) => set({ seal: seal || undefined })} />
      <SelectField label={t("artTone")} hint={t("artToneHint")} value={value.artTone ?? ""} onChange={(artTone) => { const next = { ...value }; if (artTone) next.artTone = artTone; else delete next.artTone; onChange(next); }}
        options={[{ value: "" as const, label: `${t("inherit")}${defaults ? ` (${t(`artTones.${defaults.artTone ?? "natural"}`)})` : ""}` }, { value: "natural" as const, label: t("artTones.natural") }, { value: "gold" as const, label: t("artTones.gold") }]} />
      <fieldset className="sm:col-span-2"><legend className="mb-2 text-sm">{t("effects")}</legend><div className="flex flex-wrap gap-2">
        {EFFECTS.map((effect) => <label key={effect} className="flex min-h-11 items-center gap-2 rounded-control border border-border px-3 text-sm"><input type="checkbox" checked={displayed.effects?.includes(effect) ?? false} onChange={(e) => set({ effects: e.target.checked ? [...displayed.effects ?? [], effect] : (displayed.effects ?? []).filter((v) => v !== effect) })} />{t(effect)}</label>)}
        <button type="button" className="min-h-11 text-xs underline" onClick={() => { const next = { ...value }; delete next.effects; onChange(next); }}>{t("inherit")}</button>
      </div></fieldset>
      {range("intensity", 0, 1, 0.05)}{range("speed", 0.2, 5, 0.1)}
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={displayed.reactive ?? true} onChange={(e) => set({ reactive: e.target.checked })} />{t("reactive")}</label>
    </>}
  </div>;
}

export function ImageFramingFields({ value, onChange }: { value: CardAppearance; onChange: (v: CardAppearance) => void }) {
  const t = useTranslations("admin.catalog");
  return <div className="grid gap-3 sm:grid-cols-3">{(["focalX", "focalY", "zoom"] as const).map((key) => <Field key={key} label={t(key)}>
    {(id) => <input id={id} type="range" className={`${inputClass} accent-shu`} min={key === "zoom" ? 1 : 0} max={key === "zoom" ? 3 : 100} step={key === "zoom" ? 0.05 : 1} value={value[key] ?? APPEARANCE_DEFAULTS[key]} onChange={(e) => onChange({ ...value, [key]: e.target.valueAsNumber })} />}
  </Field>)}</div>;
}
