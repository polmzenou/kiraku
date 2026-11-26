"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SLUG_PATTERN } from "@/lib/boosters/types";
import { useRarities, useRarityDefinitions } from "@/lib/catalog/use-rarities";
import { expeditionTypeInputSchema, MAX_EXPEDITION_BOOSTERS, MAX_EXPEDITION_MINUTES, MAX_EXPEDITION_ZENI, type ExpeditionTypeInput } from "@/lib/expedition/admin-form";
import { balanceFor } from "@/lib/expedition/balance";
import { headroom } from "@/lib/expedition/tiers";
import { EXPEDITION_RISKS, type CardBonus } from "@/lib/expedition/types";
import { saveExpeditionTypeAction } from "@/server/actions/admin-expedition";
import { Button } from "../ui/Button";
import { FormMessage, NumberField, SelectField, TextField, Toggle } from "./fields";

type Option = { id: string; name: string };

const empty = (boosterTypeId: string): ExpeditionTypeInput => ({
  slug: "",
  name: { fr: "", en: "" },
  lore: { fr: "", en: "" },
  minRarity: "EPIC",
  risk: "BALANCED",
  durationMinutes: 120,
  baseSuccessPct: 60,
  maxSuccessPct: 95,
  maxTriumphPct: 15,
  minDiscoveryPct: 0,
  zeni: 400,
  boosterTypeId,
  boosters: 2,
  extraLotId: null,
  weight: 10,
  active: true,
  sortOrder: 0,
});

/** Création ou modification d'un modèle d'expédition, avec l'aperçu d'équilibrage en direct. */
export function ExpeditionTypeForm({
  initial,
  boosters,
  lots,
  rules,
}: {
  initial: ExpeditionTypeInput | null;
  boosters: Option[];
  lots: Option[];
  rules: { cardBonus: CardBonus; triumphRewardPct: number; failRewardPct: number };
}) {
  const t = useTranslations("admin.expeditions");
  const tRisk = useTranslations("expedition.risk");
  const tRarity = useTranslations("rarity");
  const format = useFormatter();
  const RARITIES = useRarities();
  const definitions = useRarityDefinitions();
  const router = useRouter();
  const [draft, setDraft] = useState<ExpeditionTypeInput>(initial ?? empty(boosters[0]?.id ?? ""));
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const valid = expeditionTypeInputSchema.safeParse(draft).success;
  const update = (patch: Partial<ExpeditionTypeInput>) => {
    setDraft((d) => {
      const next = { ...d, ...patch };
      // Une expédition sûre réussit toujours
      return next.risk === "SAFE" ? { ...next, baseSuccessPct: 100, maxSuccessPct: 100 } : next;
    });
    setMessage(null);
  };

  const preview = valid ? balanceFor(draft, rules, rules.cardBonus, headroom(draft.minRarity, definitions)) : null;

  const save = () =>
    startTransition(async () => {
      try {
        const res = await saveExpeditionTypeAction(draft);
        if (res.ok) {
          setMessage({ tone: "ok", text: t("saved") });
          if (!draft.id) setDraft(empty(boosters[0]?.id ?? ""));
          router.refresh();
        } else {
          setMessage({ tone: "error", text: t(`errors.${res.error}`) });
        }
      } catch {
        setMessage({ tone: "error", text: t("errors.unexpected") });
      }
    });

  return (
    <form
      className="flex flex-col gap-4 lacquer rounded-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <h3 className="font-bold">{draft.id ? t("editType") : t("newType")}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label={t("fields.nameFr")} value={draft.name.fr} maxLength={80} onChange={(fr) => update({ name: { ...draft.name, fr } })} />
        <TextField label={t("fields.nameEn")} value={draft.name.en} maxLength={80} onChange={(en) => update({ name: { ...draft.name, en } })} />
        <TextField label={t("fields.loreFr")} value={draft.lore.fr} maxLength={200} onChange={(fr) => update({ lore: { ...draft.lore, fr } })} />
        <TextField label={t("fields.loreEn")} value={draft.lore.en} maxLength={200} onChange={(en) => update({ lore: { ...draft.lore, en } })} />
        <TextField
          label={t("fields.slug")}
          hint={t("fields.slugHint")}
          value={draft.slug}
          maxLength={40}
          invalid={draft.slug !== "" && !SLUG_PATTERN.test(draft.slug)}
          onChange={(slug) => update({ slug: slug.trim().toLowerCase() })}
        />
        <SelectField
          label={t("fields.minRarity")}
          value={draft.minRarity}
          onChange={(minRarity) => update({ minRarity })}
          options={RARITIES.map((r) => ({ value: r, label: tRarity(r as "COMMON") }))}
        />
        <SelectField label={t("fields.risk")} value={draft.risk} onChange={(risk) => update({ risk })} options={EXPEDITION_RISKS.map((r) => ({ value: r, label: tRisk(r) }))} />
        <NumberField label={t("fields.durationMinutes")} hint={t("fields.durationHint")} value={draft.durationMinutes} min={1} max={MAX_EXPEDITION_MINUTES} onChange={(durationMinutes) => update({ durationMinutes })} />
        <NumberField label={t("fields.baseSuccessPct")} hint={t("fields.baseHint")} value={draft.baseSuccessPct} min={0} max={100} onChange={(baseSuccessPct) => update({ baseSuccessPct })} />
        <NumberField label={t("fields.maxSuccessPct")} value={draft.maxSuccessPct} min={0} max={100} onChange={(maxSuccessPct) => update({ maxSuccessPct })} />
        <NumberField label={t("fields.maxTriumphPct")} hint={t("fields.triumphHint")} value={draft.maxTriumphPct} min={0} max={100} onChange={(maxTriumphPct) => update({ maxTriumphPct })} />
        <NumberField label={t("fields.minDiscoveryPct")} hint={t("fields.discoveryHint")} value={draft.minDiscoveryPct} min={0} max={100} onChange={(minDiscoveryPct) => update({ minDiscoveryPct })} />
        <NumberField label={t("fields.zeni")} value={draft.zeni} min={0} max={MAX_EXPEDITION_ZENI} onChange={(zeni) => update({ zeni })} />
        <NumberField label={t("fields.boosters")} value={draft.boosters} min={0} max={MAX_EXPEDITION_BOOSTERS} onChange={(boosters) => update({ boosters })} />
        <SelectField label={t("fields.boosterType")} value={draft.boosterTypeId} onChange={(boosterTypeId) => update({ boosterTypeId })} options={boosters.map((b) => ({ value: b.id, label: b.name }))} />
        <SelectField
          label={t("fields.extraLot")}
          hint={t("fields.extraLotHint")}
          value={draft.extraLotId ?? ""}
          onChange={(v) => update({ extraLotId: v || null })}
          options={[{ value: "", label: t("fields.noLot") }, ...lots.map((l) => ({ value: l.id, label: l.name }))]}
        />
        <NumberField label={t("fields.weight")} hint={t("fields.weightHint")} value={draft.weight} min={0} max={1000} onChange={(weight) => update({ weight })} />
        <NumberField label={t("fields.sortOrder")} value={draft.sortOrder} min={-10_000} max={10_000} onChange={(sortOrder) => update({ sortOrder })} />
        <Toggle label={t("fields.active")} checked={draft.active} onChange={(active) => update({ active })} />
      </div>

      {preview && (
        <section className="flex flex-col gap-1 rounded-card border border-border p-3 text-sm" aria-live="polite">
          <h4 className="font-bold">{t("preview.title")}</h4>
          {(["minimal", "ideal"] as const).map((k) => (
            <p key={k} className="tabular-nums text-text-muted">
              {t(`preview.${k}`, {
                success: preview[k].success,
                triumph: preview[k].triumph,
                zeni: format.number(preview[k].zeni),
                boosters: format.number(preview[k].boosters),
                perHour: format.number(preview[k].zeniPerHour),
              })}
            </p>
          ))}
          <p className="tabular-nums text-text-muted">
            {t("preview.rewards", {
              triumph: format.number(preview.rewards.TRIUMPH.zeni),
              triumphBoosters: preview.rewards.TRIUMPH.boosters,
              success: format.number(preview.rewards.SUCCESS.zeni),
              successBoosters: preview.rewards.SUCCESS.boosters,
              failure: format.number(preview.rewards.FAILURE.zeni),
            })}
          </p>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={pending || !valid}>
          {pending ? t("saving") : t("save")}
        </Button>
        {draft.id && (
          <Button type="button" onClick={() => router.push("?")}>
            {t("cancelEdit")}
          </Button>
        )}
      </div>
      <FormMessage message={message} />
    </form>
  );
}
