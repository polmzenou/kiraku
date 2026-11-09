"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import type { ProfileCondition } from "@/lib/profile/conditions";
import { cosmeticInputSchema, type CosmeticInput } from "@/lib/profile/cosmetic-form";
import { FRAME_STYLES, type FrameStyle } from "@/lib/profile/frames";
import { NAME_COLOR_STYLES, NAME_COLOR_SWATCH } from "@/lib/profile/name-colors";
import { adminSaveCosmeticAction } from "@/server/actions/admin-cosmetics";
import { AvatarFrame } from "../profile/AvatarFrame";
import { PlayerName } from "../social/PlayerName";
import { Button } from "../ui/Button";
import { ConditionFields } from "./ConditionFields";
import { FormMessage, NumberField, SelectField, TextField, Toggle } from "./fields";

/** Création ou modification d'un titre, d'un cadre ou d'une couleur de pseudo, avec sa condition de déblocage. */
export function CosmeticForm({ initial, seriesTitle }: { initial: CosmeticInput; seriesTitle: string | null }) {
  const t = useTranslations("admin.cosmetics");
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const valid = cosmeticInputSchema.safeParse(draft).success;
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

      <ConditionFields value={draft.condition} onChange={setCondition} seriesTitle={seriesTitle} />

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
