"use client";

import { useRarities } from "@/lib/catalog/use-rarities";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { type Rarity } from "@/lib/catalog/rarity";
import { MISSION_METRICS, MISSION_PERIODS, missionInputSchema, type MissionInput } from "@/lib/economy/missions";
import { saveMissionAction } from "@/server/actions/admin-economy";
import { Button } from "../ui/Button";
import { FormMessage, NumberField, SelectField, TextField, Toggle } from "./fields";

const emptyMission = (lotId: string): MissionInput => ({
  key: "",
  period: "DAILY",
  metric: "OPEN_BOOSTERS",
  goal: 5,
  rarity: null,
  title: null,
  lotId,
  active: true,
  sortOrder: 0,
});

/** Création ou modification d'une mission : période, ce qu'elle compte, objectif, lot. */
export function MissionForm({ initial, lots }: { initial: MissionInput | null; lots: { id: string; name: string }[] }) {
  const RARITIES = useRarities();
  const t = useTranslations("admin.economy");
  const tMetric = useTranslations("economy.missions.metric");
  const tPeriod = useTranslations("economy.missions.period");
  const tRarity = useTranslations("rarity");
  const router = useRouter();
  const [draft, setDraft] = useState<MissionInput>(initial ?? emptyMission(lots[0]?.id ?? ""));
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const valid = missionInputSchema.safeParse(draft).success;
  const update = (patch: Partial<MissionInput>) => {
    setDraft({ ...draft, ...patch });
    setMessage(null);
  };

  if (lots.length === 0) return <p className="text-sm text-text-muted">{t("needLot")}</p>;

  const save = () =>
    startTransition(async () => {
      try {
        const res = await saveMissionAction(draft);
        if (res.ok) {
          setMessage({ tone: "ok", text: t("missionSaved") });
          if (!draft.id) setDraft(emptyMission(lots[0].id));
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
      <h3 className="font-bold">{draft.id ? t("editMission") : t("newMission")}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label={t("missionKey")} hint={t("missionKeyHint")} value={draft.key} maxLength={40} onChange={(key) => update({ key })} />
        <SelectField
          label={t("period")}
          value={draft.period}
          onChange={(period) => update({ period })}
          options={MISSION_PERIODS.map((p) => ({ value: p, label: tPeriod(p) }))}
        />
        <SelectField
          label={t("metric")}
          value={draft.metric}
          onChange={(metric) =>
            update({
              metric,
              rarity: metric === "PULL_RARITY" ? (draft.rarity ?? "EPIC") : null,
              goal: metric === "VISIT" ? 1 : draft.goal,
            })
          }
          options={MISSION_METRICS.map((m) => ({ value: m, label: tMetric(m, { count: draft.goal, rarity: tRarity(draft.rarity ?? "EPIC") }) }))}
        />
        <NumberField label={t("goal")} value={draft.goal} onChange={(goal) => update({ goal })} min={1} max={draft.metric === "VISIT" ? 1 : 1_000_000} />
        {draft.metric === "PULL_RARITY" && (
          <SelectField
            label={t("minRarity")}
            value={draft.rarity ?? "EPIC"}
            onChange={(rarity) => update({ rarity: rarity as Rarity })}
            options={RARITIES.map((r) => ({ value: r, label: tRarity(r) }))}
          />
        )}
        <SelectField label={t("lot")} value={draft.lotId} onChange={(lotId) => update({ lotId })} options={lots.map((l) => ({ value: l.id, label: l.name }))} />
        <TextField
          label={t("titleFr")}
          hint={t("titleHint")}
          value={draft.title?.fr ?? ""}
          maxLength={80}
          onChange={(fr) => update({ title: fr || draft.title?.en ? { fr, en: draft.title?.en ?? "" } : null })}
        />
        <TextField
          label={t("titleEn")}
          value={draft.title?.en ?? ""}
          maxLength={80}
          onChange={(en) => update({ title: en || draft.title?.fr ? { fr: draft.title?.fr ?? "", en } : null })}
        />
        <NumberField label={t("sortOrder")} value={draft.sortOrder} onChange={(sortOrder) => update({ sortOrder })} min={0} max={10_000} />
        <Toggle label={t("active")} checked={draft.active} onChange={(active) => update({ active })} />
      </div>
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
