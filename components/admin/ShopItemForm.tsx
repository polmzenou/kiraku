"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SHOP_LIMIT_PERIODS, shopItemInputSchema, type ShopItemInput, type ShopLimitPeriod } from "@/lib/economy/shop";
import { saveShopItemAction } from "@/server/actions/admin-economy";
import { Button } from "../ui/Button";
import { Field, FormMessage, inputClass, NumberField, OptionalNumberField, SelectField, TextField, Toggle } from "./fields";

const emptyItem = (lotId: string): ShopItemInput => ({
  slug: "",
  name: { fr: "", en: "" },
  description: { fr: "", en: "" },
  lotId,
  priceZeni: 200,
  priceCents: null,
  stripePriceId: null,
  perUserLimit: null,
  limitPeriod: null,
  startsAt: null,
  endsAt: null,
  active: true,
  sortOrder: 0,
});

/** Date → valeur d'un champ datetime-local (heure locale du navigateur de l'admin). */
function toLocalInput(d: Date | null): string {
  if (!d) return "";
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function DateField({ label, value, onChange }: { label: string; value: Date | null; onChange: (d: Date | null) => void }) {
  return (
    <Field label={label}>
      {(id) => (
        <input
          id={id}
          type="datetime-local"
          value={toLocalInput(value)}
          onChange={(e) => onChange(e.target.value ? new Date(e.target.value) : null)}
          className={inputClass}
        />
      )}
    </Field>
  );
}

/** Création ou modification d'un article : lot livré, prix, limites et dates. */
export function ShopItemForm({ initial, lots }: { initial: ShopItemInput | null; lots: { id: string; name: string }[] }) {
  const t = useTranslations("admin.economy");
  const router = useRouter();
  const [draft, setDraft] = useState<ShopItemInput>(initial ?? emptyItem(lots[0]?.id ?? ""));
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const valid = shopItemInputSchema.safeParse(draft).success;
  const update = (patch: Partial<ShopItemInput>) => {
    setDraft({ ...draft, ...patch });
    setMessage(null);
  };

  if (lots.length === 0) return <p className="text-sm text-text-muted">{t("needLot")}</p>;

  const save = () =>
    startTransition(async () => {
      try {
        const res = await saveShopItemAction(draft);
        if (res.ok) {
          setMessage({ tone: "ok", text: t("itemSaved") });
          if (!draft.id) setDraft(emptyItem(lots[0].id));
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
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <h3 className="font-bold">{draft.id ? t("editItem") : t("newItem")}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label={t("slug")} value={draft.slug} maxLength={40} onChange={(slug) => update({ slug })} />
        <SelectField label={t("lot")} value={draft.lotId} onChange={(lotId) => update({ lotId })} options={lots.map((l) => ({ value: l.id, label: l.name }))} />
        <TextField label={t("nameFr")} value={draft.name.fr} maxLength={80} onChange={(fr) => update({ name: { ...draft.name, fr } })} />
        <TextField label={t("nameEn")} value={draft.name.en} maxLength={80} onChange={(en) => update({ name: { ...draft.name, en } })} />
        <TextField
          label={t("descriptionFr")}
          value={draft.description.fr}
          maxLength={240}
          onChange={(fr) => update({ description: { ...draft.description, fr } })}
        />
        <TextField
          label={t("descriptionEn")}
          value={draft.description.en}
          maxLength={240}
          onChange={(en) => update({ description: { ...draft.description, en } })}
        />
        <OptionalNumberField label={t("priceZeni")} value={draft.priceZeni} onChange={(priceZeni) => update({ priceZeni })} min={1} max={10_000_000} />
        <OptionalNumberField
          label={t("perUserLimit")}
          value={draft.perUserLimit}
          onChange={(perUserLimit) => update({ perUserLimit, limitPeriod: perUserLimit === null ? null : (draft.limitPeriod ?? "DAILY") })}
          min={1}
          max={1_000}
        />
        {draft.perUserLimit !== null && (
          <SelectField
            label={t("limitPeriod")}
            value={draft.limitPeriod ?? "DAILY"}
            onChange={(limitPeriod) => update({ limitPeriod: limitPeriod as ShopLimitPeriod })}
            options={SHOP_LIMIT_PERIODS.map((p) => ({ value: p, label: t(`limitPeriods.${p}`) }))}
          />
        )}
        <DateField label={t("startsAt")} value={draft.startsAt} onChange={(startsAt) => update({ startsAt })} />
        <DateField label={t("endsAt")} value={draft.endsAt} onChange={(endsAt) => update({ endsAt })} />
        <NumberField label={t("sortOrder")} value={draft.sortOrder} onChange={(sortOrder) => update({ sortOrder })} min={0} max={10_000} />
        <Toggle label={t("active")} checked={draft.active} onChange={(active) => update({ active })} />
      </div>

      <fieldset className="grid gap-4 rounded-button border border-border p-3 sm:grid-cols-2">
        <legend className="px-1 text-sm font-bold">{t("cardPayment")}</legend>
        <p className="text-xs text-text-muted sm:col-span-2">{t("cardPaymentHint")}</p>
        <OptionalNumberField label={t("priceCents")} value={draft.priceCents} onChange={(priceCents) => update({ priceCents })} min={50} max={100_000} />
        <TextField
          label={t("stripePriceId")}
          value={draft.stripePriceId ?? ""}
          maxLength={66}
          onChange={(v) => update({ stripePriceId: v.trim() || null })}
        />
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="shu" disabled={pending || !valid}>
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
