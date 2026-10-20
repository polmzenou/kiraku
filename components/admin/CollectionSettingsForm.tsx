"use client";

import { useRarities, useRaritySeals } from "@/lib/catalog/use-rarities";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { MAX_SHOWCASE_SLOTS } from "@/lib/collection/showcase";
import {
  changedCollectionKeys,
  collectionSettingsSchema,
  type CollectionSettings,
} from "@/lib/settings/collection-form";
import { updateCollectionSettings } from "@/server/actions/admin-settings";
import { Button } from "../ui/Button";

const input =
  "min-h-11 w-full min-w-0 rounded-control border border-border bg-surface-2 px-3 text-base tabular-nums aria-invalid:border-shu";

function NumberInput({ label, value, onChange, min, max }: { label: React.ReactNode; value: number; onChange: (v: number) => void; min: number; max: number }) {
  const id = useId();
  const invalid = !Number.isInteger(value) || value < min || value > max;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={Number.isFinite(value) ? value : ""}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        className={input}
      />
    </div>
  );
}

/** Réglages de la collection : Zeni par doublon recyclé et taille de la vitrine. */
export function CollectionSettingsForm({ initial }: { initial: CollectionSettings }) {
  const RARITIES = useRarities();
  const RARITY_SEAL = useRaritySeals();
  const t = useTranslations("admin.collection");
  const tRarity = useTranslations("rarity");
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [reviewing, setReviewing] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const valid = collectionSettingsSchema.safeParse(draft).success;
  const changed = valid ? changedCollectionKeys(initial, draft) : [];
  const values = draft["collection.recycleValues"];

  const update = (next: CollectionSettings) => {
    setDraft(next);
    setReviewing(false);
    setMessage(null);
  };

  const save = () =>
    startTransition(async () => {
      try {
        const res = await updateCollectionSettings(draft);
        setReviewing(false);
        if (!res.ok) {
          setMessage({ tone: "error", text: t(`errors.${res.error}`) });
          return;
        }
        setMessage({ tone: "ok", text: t("saved", { count: res.changed.length }) });
        router.refresh();
      } catch {
        setMessage({ tone: "error", text: t("errors.unexpected") });
      }
    });

  return (
    <form className="flex max-w-2xl flex-col gap-6" onSubmit={(e) => e.preventDefault()}>
      <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("recycleSection")}</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[...RARITIES].reverse().map((r) => (
            <NumberInput
              key={r}
              label={
                <>
                  <span aria-hidden="true" lang="ja" className="font-seal">
                    {RARITY_SEAL[r]}
                  </span>{" "}
                  {tRarity(r)}
                </>
              }
              value={values[r]}
              onChange={(v) => update({ ...draft, "collection.recycleValues": { ...values, [r]: v } })}
              min={0}
              max={100_000}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("showcaseSection")}</legend>
        <NumberInput
          label={t("fields.showcaseSlots")}
          value={draft["showcase.slots"]}
          onChange={(v) => update({ ...draft, "showcase.slots": v })}
          min={1}
          max={MAX_SHOWCASE_SLOTS}
        />
        <p className="text-xs text-text-muted">{t("showcaseHint")}</p>
      </fieldset>

      {!valid && (
        <p role="alert" className="text-sm text-shu">
          {t("invalid")}
        </p>
      )}

      {reviewing && valid && changed.length > 0 ? (
        <section className="flex flex-col gap-3 rounded-card border border-shu bg-surface p-4" aria-live="polite">
          <h3 className="font-bold">{t("confirmTitle")}</h3>
          <ul className="list-inside list-disc text-sm">
            {changed.map((k) => (
              <li key={k}>{t(`keys.${k === "showcase.slots" ? "showcaseSlots" : "recycleValues"}`)}</li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" onClick={() => setReviewing(false)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button type="button" variant="primary" onClick={save} disabled={pending}>
              {t("confirm")}
            </Button>
          </div>
        </section>
      ) : (
        <Button
          type="button"
          variant="primary"
          className="self-start"
          disabled={!valid || pending}
          onClick={() => {
            if (changed.length === 0) setMessage({ tone: "ok", text: t("noChange") });
            else setReviewing(true);
          }}
        >
          {t("review")}
        </Button>
      )}

      {message && (
        <p role="status" className={`text-sm ${message.tone === "ok" ? "text-text-muted" : "text-shu"}`}>
          {message.text}
        </p>
      )}
    </form>
  );
}
