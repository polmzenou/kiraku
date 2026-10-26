"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useRarityDefinitions } from "@/lib/catalog/use-rarities";
import { CONDITION_TYPES, type ConditionType, type ProfileCondition } from "@/lib/profile/conditions";
import { cosmeticInputSchema, type CosmeticInput } from "@/lib/profile/cosmetic-form";
import { FRAME_STYLES, type FrameStyle } from "@/lib/profile/frames";
import { NAME_COLOR_STYLES, NAME_COLOR_SWATCH } from "@/lib/profile/name-colors";
import { LADDER } from "@/lib/ranked/rules";
import { adminSaveCosmeticAction, adminSearchSeriesAction } from "@/server/actions/admin-cosmetics";
import { AvatarFrame } from "../profile/AvatarFrame";
import { PlayerName } from "../social/PlayerName";
import { Button } from "../ui/Button";
import { Field, FormMessage, inputClass, NumberField, SelectField, TextField, Toggle } from "./fields";

/** Valeurs d'une nouvelle condition quand l'admin change de type. */
function defaultCondition(type: ConditionType, rarity: string): ProfileCondition {
  switch (type) {
    case "ALWAYS":
    case "AMBASSADOR":
      return { type };
    case "RARITY_OWNED":
      return { type, rarity, n: 1 };
    case "SERIES_COMPLETE":
      return { type, seriesId: "" };
    case "RANK_TIER":
      return { type, tier: "GOLD" };
    case "CATALOG_DISCOVERED_PERCENT":
      return { type, n: 50 };
    case "RARITIES_DISCOVERED":
      return { type, rarities: [rarity], n: 1 };
    default:
      return { type, n: 10 };
  }
}

/** Création ou modification d'un titre, d'un cadre ou d'une couleur de pseudo, avec sa condition de déblocage. */
export function CosmeticForm({ initial, seriesTitle }: { initial: CosmeticInput; seriesTitle: string | null }) {
  const t = useTranslations("admin.cosmetics");
  const rarities = useRarityDefinitions();
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [series, setSeries] = useState<{ id: string; title: string }[]>([]);
  const [seriesLabel, setSeriesLabel] = useState(seriesTitle);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const valid = cosmeticInputSchema.safeParse(draft).success;
  const c = draft.condition;
  const set = (patch: Partial<CosmeticInput>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setMessage(null);
  };
  const setCondition = (condition: ProfileCondition) => set({ condition });

  const save = () =>
    startTransition(async () => {
      const res = await adminSaveCosmeticAction(draft);
      if (!res.ok) {
        setMessage({ tone: "error", text: t(`errors.${res.error}`) });
        return;
      }
      setMessage({ tone: "ok", text: t("saved") });
      if (!draft.id) router.replace(`/admin/cosmetiques?edit=${res.id}`);
      else router.refresh();
    });

  return (
    <form className="flex max-w-2xl flex-col gap-4 lacquer rounded-card p-4" onSubmit={(e) => e.preventDefault()}>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label={t("fields.kind")}
          value={draft.kind}
          options={[
            { value: "TITLE", label: t("kinds.TITLE") },
            { value: "FRAME", label: t("kinds.FRAME") },
            { value: "NAME_COLOR", label: t("kinds.NAME_COLOR") },
          ]}
          onChange={(kind) =>
            set({
              kind,
              frameStyle: kind === "FRAME" ? (draft.frameStyle ?? "washi") : null,
              nameColor: kind === "NAME_COLOR" ? (draft.nameColor ?? "lime") : null,
            })
          }
        />
        <TextField label={t("fields.slug")} hint={t("hints.slug")} value={draft.slug} maxLength={40} onChange={(slug) => set({ slug: slug.toLowerCase() })} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <TextField label={t("fields.labelFr")} value={draft.label.fr} maxLength={60} onChange={(fr) => set({ label: { ...draft.label, fr } })} />
        <TextField label={t("fields.labelFrFem")} hint={t("hints.labelFrFem")} value={draft.label.frFem} maxLength={60} onChange={(frFem) => set({ label: { ...draft.label, frFem } })} />
        <TextField label={t("fields.labelEn")} value={draft.label.en} maxLength={60} onChange={(en) => set({ label: { ...draft.label, en } })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label={t("fields.hintFr")} hint={t("hints.hint")} value={draft.hint.fr} maxLength={160} onChange={(fr) => set({ hint: { ...draft.hint, fr } })} />
        <TextField label={t("fields.hintEn")} value={draft.hint.en} maxLength={160} onChange={(en) => set({ hint: { ...draft.hint, en } })} />
      </div>

      {draft.kind === "FRAME" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm">{t("fields.frameStyle")}</legend>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {FRAME_STYLES.map((style: FrameStyle) => (
              <label key={style} className="flex cursor-pointer flex-col items-center gap-1 rounded-control p-1 text-xs has-[:checked]:bg-surface-2 has-[:checked]:font-bold">
                <input type="radio" name="frameStyle" className="sr-only" checked={draft.frameStyle === style} onChange={() => set({ frameStyle: style })} />
                <AvatarFrame frame={style} size={40}>
                  <span className="block size-10 rounded-full bg-surface-2" />
                </AvatarFrame>
                {t(`frames.${style}`)}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {draft.kind === "NAME_COLOR" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm">{t("fields.nameColor")}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {NAME_COLOR_STYLES.map((style) => (
              <label key={style} className="flex min-h-11 cursor-pointer flex-col gap-1 rounded-control p-2 text-xs has-[:checked]:bg-surface-2 has-[:checked]:font-bold">
                <input type="radio" name="nameColor" className="sr-only" checked={draft.nameColor === style} onChange={() => set({ nameColor: style })} />
                <PlayerName name={draft.label.fr || "Kiraku"} color={style} className="truncate text-base font-bold" />
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: NAME_COLOR_SWATCH[style] }} />
                  {t(`colors.${style}`)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-3 rounded-control border border-border p-3">
        <legend className="px-1 text-sm font-bold">{t("fields.condition")}</legend>
        <SelectField
          label={t("fields.conditionType")}
          value={c.type}
          options={CONDITION_TYPES.map((type) => ({ value: type, label: t(`conditions.${type}`) }))}
          onChange={(type) => setCondition(defaultCondition(type, rarities.at(-1)?.key ?? "MYTHIC"))}
        />
        {"n" in c && (
          <NumberField
            label={c.type === "CATALOG_DISCOVERED_PERCENT" ? t("fields.percent") : t("fields.n")}
            value={c.n}
            min={1}
            max={c.type === "CATALOG_DISCOVERED_PERCENT" ? 100 : 1_000_000}
            onChange={(n) => setCondition({ ...c, n: n ?? 1 } as ProfileCondition)}
          />
        )}
        {c.type === "RARITIES_DISCOVERED" && (
          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm">{t("fields.rarities")}</legend>
            <div className="flex flex-wrap gap-2">
              {rarities.map((r) => (
                <label key={r.key} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-border px-3 text-sm has-[:checked]:bg-surface-2 has-[:checked]:font-bold">
                  <input
                    type="checkbox"
                    checked={c.rarities.includes(r.key)}
                    onChange={(e) =>
                      setCondition({ ...c, rarities: e.target.checked ? [...c.rarities, r.key] : c.rarities.filter((k) => k !== r.key) })
                    }
                  />
                  {r.seal} {r.nameFr}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {c.type === "RARITY_OWNED" && (
          <SelectField
            label={t("fields.rarity")}
            value={c.rarity}
            options={rarities.map((r) => ({ value: r.key, label: `${r.seal} ${r.nameFr}` }))}
            onChange={(rarity) => setCondition({ ...c, rarity })}
          />
        )}
        {c.type === "RANK_TIER" && (
          <SelectField label={t("fields.tier")} value={c.tier} options={LADDER.map((tier) => ({ value: tier, label: tier }))} onChange={(tier) => setCondition({ ...c, tier })} />
        )}
        {c.type === "SERIES_COMPLETE" && (
          <Field label={t("fields.series")} hint={seriesLabel ? t("hints.seriesChosen", { title: seriesLabel }) : t("hints.series")}>
            {(id) => (
              <div className="flex flex-col gap-2">
                <input
                  id={id}
                  type="search"
                  maxLength={100}
                  placeholder={t("seriesPlaceholder")}
                  onChange={(e) => {
                    const q = e.target.value.trim();
                    if (q.length >= 2) void adminSearchSeriesAction(q).then(setSeries);
                  }}
                  className={inputClass}
                />
                {series.length > 0 && (
                  <ul className="flex max-h-48 flex-col overflow-y-auto rounded-control border border-border">
                    {series.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          aria-pressed={c.seriesId === s.id}
                          onClick={() => {
                            setCondition({ ...c, seriesId: s.id });
                            setSeriesLabel(s.title);
                            setSeries([]);
                          }}
                          className="min-h-11 w-full px-3 text-left text-sm hover:bg-surface-2 aria-pressed:font-bold"
                        >
                          {s.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Field>
        )}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <NumberField label={t("fields.sortOrder")} value={draft.sortOrder} min={-10_000} max={10_000} onChange={(sortOrder) => set({ sortOrder: sortOrder ?? 0 })} />
        <Toggle label={t("fields.active")} checked={draft.active} onChange={(active) => set({ active })} />
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" variant="primary" disabled={!valid || pending} onClick={save}>
          {pending ? t("saving") : t("save")}
        </Button>
        {!valid && <p className="text-sm text-shu">{t("invalid")}</p>}
      </div>
      <FormMessage message={message} />
    </form>
  );
}
