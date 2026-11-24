"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { GUARANTEE_GRANT_MAX, guaranteeGrantSchema } from "@/lib/boosters/guaranteed";
import { grantGuaranteedBoosterAction, type GrantGuaranteedResult } from "@/server/actions/admin-guaranteed";
import { Button } from "../ui/Button";
import { NoteField } from "../ui/NoteField";
import { FormMessage, NumberField, SelectField, TextField } from "./fields";

export type GuaranteedOption = {
  slug: string;
  /** Sceau et nom de la rareté, ex. « 極 Xtreme Rare ». */
  label: string;
  /** Le pool a des cartes de cette rareté : sinon, rien à donner. */
  available: boolean;
};

/** Erreurs expliquées au formulaire ; les autres (rares) tombent sur « unexpected ». */
const ERRORS = ["FORBIDDEN", "INVALID", "RATE_LIMITED", "NO_USER", "NOT_FOUND", "NOT_GUARANTEED", "EMPTY_RARITY", "LIMIT", "INSUFFICIENT"] as const;
const errorKey = (code: string) => ((ERRORS as readonly string[]).includes(code) ? (code as (typeof ERRORS)[number]) : "unexpected");

/** Donner un booster garanti à un joueur, par son pseudo : il le reçoit en cadeau de l'équipe, notifié. */
export function GuaranteedGrantForm({ options, initial }: { options: GuaranteedOption[]; initial?: string }) {
  const t = useTranslations("admin.guaranteed");
  const first = options.find((o) => o.slug === initial && o.available) ?? options.find((o) => o.available) ?? options[0];
  const [slug, setSlug] = useState(first?.slug ?? "");
  const [username, setUsername] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState(t("reasonDefault"));
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<GrantGuaranteedResult | "unexpected" | null>(null);
  const option = options.find((o) => o.slug === slug);
  const input = { slug, username, quantity, reason, message };
  const valid = option?.available === true && guaranteeGrantSchema.safeParse(input).success;

  const text =
    result === "unexpected"
      ? t("errors.unexpected")
      : result?.ok
        ? t("done", { count: result.quantity, username: result.username, booster: option?.label ?? "" })
        : result
          ? t(`errors.${errorKey(result.error)}`)
          : "";

  return (
    <form
      id="donner"
      aria-labelledby="donner-titre"
      className="flex scroll-mt-24 flex-col gap-4 lacquer rounded-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || pending) return;
        setResult(null);
        startTransition(async () => {
          try {
            const res = await grantGuaranteedBoosterAction(input);
            setResult(res);
            if (res.ok) {
              setUsername("");
              setMessage("");
            }
          } catch {
            setResult("unexpected");
          }
        });
      }}
    >
      <h3 id="donner-titre" className="flex items-center gap-2 font-title text-lg font-bold">
        <span aria-hidden="true" lang="ja" className="font-seal text-shu">
          贈
        </span>
        {t("grantTitle")}
      </h3>
      <fieldset disabled={pending} className="grid min-w-0 gap-4 md:grid-cols-2">
        <SelectField
          label={t("booster")}
          value={slug}
          onChange={setSlug}
          options={options.map((o) => ({ value: o.slug, label: o.available ? o.label : `${o.label} · ${t("unavailable")}` }))}
        />
        <TextField label={t("username")} value={username} onChange={setUsername} maxLength={32} hint={t("usernameHint")} />
        <NumberField label={t("quantity")} min={1} max={GUARANTEE_GRANT_MAX} value={quantity} onChange={setQuantity} />
        <TextField label={t("reason")} value={reason} onChange={setReason} maxLength={300} hint={t("reasonHint")} />
        <div className="md:col-span-2">
          <NoteField label={t("message")} placeholder={t("messagePlaceholder")} value={message} onChange={setMessage} />
        </div>
      </fieldset>
      {option && !option.available && <p className="text-sm text-shu">{t("emptyHint")}</p>}
      <FormMessage message={result ? { tone: result !== "unexpected" && result.ok ? "ok" : "error", text } : null} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={!valid || pending}>
          {pending ? t("sending") : t("submit", { count: quantity })}
        </Button>
        {result !== null && result !== "unexpected" && result.ok && (
          <Link href={`/admin/utilisateurs?q=${encodeURIComponent(result.username)}`} className="text-sm text-link underline underline-offset-4">
            {t("seePlayer")}
          </Link>
        )}
      </div>
    </form>
  );
}
