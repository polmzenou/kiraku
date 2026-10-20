"use client";

import { useRarities, useRaritySeals } from "@/lib/catalog/use-rarities";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { changedSocialKeys, socialSettingsSchema, type SocialSettings } from "@/lib/settings/social-form";
import { updateSocialSettings } from "@/server/actions/admin-settings";
import { Button } from "../ui/Button";

const input =
  "min-h-11 w-full min-w-0 rounded-control border border-border bg-surface-2 px-3 text-base tabular-nums aria-invalid:border-shu";

type NumberKey = {
  [K in keyof SocialSettings]: SocialSettings[K] extends number ? K : never;
}[keyof SocialSettings];

const LIMITS: Record<NumberKey, [number, number]> = {
  "friends.max": [1, 5_000],
  "friends.maxOutgoingPending": [1, 500],
  "friends.requestCooldownHours": [0, 24 * 90],
  "gifts.perDaySent": [0, 100],
  "gifts.perDayReceived": [0, 100],
  "gifts.minAccountAgeHours": [0, 24 * 365],
  "gifts.minFriendshipHours": [0, 24 * 365],
  "gifts.boosterPriceZeni": [1, 1_000_000],
  "trades.expiryHours": [1, 24 * 30],
  "trades.maxOffered": [1, 10],
  "trades.maxPendingSent": [1, 100],
  "trades.perDay": [1, 500],
  "chat.maxLength": [20, 500],
  "chat.perMinute": [1, 120],
  "chat.retentionHours": [1, 24 * 365],
  "chat.pollSeconds": [3, 300],
  "notifications.retentionDays": [1, 365],
  "notifications.pollSeconds": [10, 600],
};

function NumberInput({ label, value, onChange, min, max }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number }) {
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

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center gap-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="choice" />
      <span>{label}</span>
    </label>
  );
}

/** Réglages du social : interrupteurs, limites anti-spam et règles anti-farm des cadeaux. */
export function SocialSettingsForm({ initial }: { initial: SocialSettings }) {
  const RARITIES = useRarities();
  const RARITY_SEAL = useRaritySeals();
  const t = useTranslations("admin.social");
  const tRarity = useTranslations("rarity");
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [reviewing, setReviewing] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const valid = socialSettingsSchema.safeParse(draft).success;
  const changed = valid ? changedSocialKeys(initial, draft) : [];

  const update = <K extends keyof SocialSettings>(key: K, value: SocialSettings[K]) => {
    setDraft({ ...draft, [key]: value });
    setReviewing(false);
    setMessage(null);
  };

  const num = (key: NumberKey) => (
    <NumberInput
      key={key}
      label={t(`keys.${key}`)}
      value={draft[key]}
      onChange={(v) => update(key, v)}
      min={LIMITS[key][0]}
      max={LIMITS[key][1]}
    />
  );

  const save = () =>
    startTransition(async () => {
      try {
        const res = await updateSocialSettings(draft);
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

  const rarityChoice = (key: "gifts.allowedRarities" | "trades.allowedRarities") => {
    const rarities = draft[key];
    return (
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm">{t(`keys.${key}`)}</legend>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
          {RARITIES.map((r) => (
            <label key={r} className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                className="choice"
                checked={rarities.includes(r)}
                onChange={(e) =>
                  update(key, e.target.checked ? RARITIES.filter((x) => x === r || rarities.includes(x)) : rarities.filter((x) => x !== r))
                }
              />
              <span aria-hidden="true" lang="ja" className="font-seal">
                {RARITY_SEAL[r]}
              </span>
              {tRarity(r)}
            </label>
          ))}
        </div>
      </fieldset>
    );
  };

  return (
    <form className="flex max-w-2xl flex-col gap-6" onSubmit={(e) => e.preventDefault()}>
      <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("friendsSection")}</legend>
        <Toggle label={t("keys.social.enabled")} checked={draft["social.enabled"]} onChange={(v) => update("social.enabled", v)} />
        <div className="grid gap-3 sm:grid-cols-3">
          {num("friends.max")}
          {num("friends.maxOutgoingPending")}
          {num("friends.requestCooldownHours")}
        </div>
      </fieldset>

      <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("giftsSection")}</legend>
        <Toggle label={t("keys.gifts.enabled")} checked={draft["gifts.enabled"]} onChange={(v) => update("gifts.enabled", v)} />
        <div className="grid gap-3 sm:grid-cols-2">
          {num("gifts.perDaySent")}
          {num("gifts.perDayReceived")}
          {num("gifts.minAccountAgeHours")}
          {num("gifts.minFriendshipHours")}
          {num("gifts.boosterPriceZeni")}
        </div>
        {rarityChoice("gifts.allowedRarities")}
        <p className="text-xs text-text-muted">{t("giftsHint")}</p>
      </fieldset>

      <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("tradesSection")}</legend>
        <Toggle label={t("keys.trades.enabled")} checked={draft["trades.enabled"]} onChange={(v) => update("trades.enabled", v)} />
        <div className="grid gap-3 sm:grid-cols-2">
          {num("trades.expiryHours")}
          {num("trades.maxOffered")}
          {num("trades.maxPendingSent")}
          {num("trades.perDay")}
        </div>
        {rarityChoice("trades.allowedRarities")}
        <p className="text-xs text-text-muted">{t("tradesHint")}</p>
      </fieldset>

      <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("chatSection")}</legend>
        <Toggle label={t("keys.chat.enabled")} checked={draft["chat.enabled"]} onChange={(v) => update("chat.enabled", v)} />
        <div className="grid gap-3 sm:grid-cols-2">
          {num("chat.maxLength")}
          {num("chat.perMinute")}
          {num("chat.retentionHours")}
          {num("chat.pollSeconds")}
        </div>
        <p className="text-xs text-text-muted">{t("chatHint")}</p>
      </fieldset>

      <fieldset className="flex min-w-0 flex-col gap-4 lacquer rounded-card p-4">
        <legend className="px-1 font-title text-lg font-bold">{t("notificationsSection")}</legend>
        <Toggle
          label={t("keys.notifications.pushEnabled")}
          checked={draft["notifications.pushEnabled"]}
          onChange={(v) => update("notifications.pushEnabled", v)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          {num("notifications.retentionDays")}
          {num("notifications.pollSeconds")}
        </div>
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
              <li key={k}>{t(`keys.${k}`)}</li>
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
