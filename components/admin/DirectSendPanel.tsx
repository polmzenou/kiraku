"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { directRewardsSchema, type DirectRewards } from "@/lib/economy/direct-send";
import { MAX_LOT_QUANTITY, MAX_LOT_ZENI } from "@/lib/economy/lots";
import { type Rarity } from "@/lib/catalog/rarity";
import { searchFeaturedCards, type FeaturedCandidate } from "@/server/actions/admin-boosters";
import { startDirectBroadcastAction } from "@/server/actions/admin-lots";
import { Button } from "../ui/Button";
import { NoteField } from "../ui/NoteField";
import { ConfirmAction } from "./ConfirmAction";
import { FormMessage, inputClass, NumberField, SelectField } from "./fields";

/** Envoi direct à tous les inscrits : Zeni, un type de booster et/ou une carte, sans préparer de lot. */
export function DirectSendPanel({ boosterTypes, registered }: { boosterTypes: { id: string; name: string }[]; registered: number }) {
  const t = useTranslations("admin.directSend");
  const tRarity = useTranslations("rarity");
  const ids = { reason: useId(), search: useId() };
  const [zeni, setZeni] = useState(0);
  const [boosterTypeId, setBoosterTypeId] = useState("");
  const [boosterQty, setBoosterQty] = useState(1);
  const [card, setCard] = useState<{ id: string; name: string } | null>(null);
  const [cardQty, setCardQty] = useState(1);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FeaturedCandidate[]>([]);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const rewards: DirectRewards = {
    zeni,
    booster: boosterTypeId ? { boosterTypeId, quantity: boosterQty } : null,
    card: card ? { cardId: card.id, quantity: cardQty } : null,
  };
  const valid = directRewardsSchema.safeParse(rewards).success;
  const boosterName = boosterTypes.find((b) => b.id === boosterTypeId)?.name;
  const summary = [
    zeni > 0 ? t("summary.zeni", { amount: zeni }) : null,
    rewards.booster && boosterName ? t("summary.booster", { count: boosterQty, name: boosterName }) : null,
    rewards.card && card ? t("summary.card", { count: cardQty, name: card.name }) : null,
  ].filter(Boolean);

  const search = () =>
    startTransition(async () => {
      setResults(query.trim().length >= 2 ? await searchFeaturedCards(query) : []);
    });

  return (
    <details className="group lacquer rounded-card p-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-title text-lg font-bold">
        {t("title")}
        <span aria-hidden="true" className="text-text-muted transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="mt-3 flex flex-col gap-4">
        <p className="max-w-prose text-sm text-text-muted">{t("intro", { count: registered })}</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField label={t("zeni")} value={zeni} onChange={setZeni} min={0} max={MAX_LOT_ZENI} />
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <SelectField
              label={t("booster")}
              value={boosterTypeId}
              onChange={setBoosterTypeId}
              options={[{ value: "", label: t("none") }, ...boosterTypes.map((b) => ({ value: b.id, label: b.name }))]}
            />
            {boosterTypeId && <NumberField label={t("quantity")} value={boosterQty} onChange={setBoosterQty} min={1} max={MAX_LOT_QUANTITY} />}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {card ? (
            <div className="grid grid-cols-[1fr_6rem] items-end gap-2">
              <div className="flex min-h-11 items-center justify-between gap-2 rounded-control border border-border px-3 text-sm">
                <span className="truncate">{t("cardChosen", { name: card.name })}</span>
                <button type="button" onClick={() => setCard(null)} className="min-h-11 shrink-0 text-xs text-shu underline">
                  {t("removeCard")}
                </button>
              </div>
              <NumberField label={t("quantity")} value={cardQty} onChange={setCardQty} min={1} max={MAX_LOT_QUANTITY} />
            </div>
          ) : (
            <>
              <label htmlFor={ids.search} className="text-sm">
                {t("card")}
              </label>
              <div className="flex gap-2">
                <input
                  id={ids.search}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      search();
                    }
                  }}
                  maxLength={60}
                  className={inputClass}
                />
                <Button type="button" onClick={search} disabled={pending}>
                  {t("search")}
                </Button>
              </div>
              {results.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {results.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-control border border-border px-3 text-left text-sm hover:border-shu"
                        onClick={() => {
                          setCard({ id: c.id, name: c.name });
                          setCardQty(1);
                          setResults([]);
                          setQuery("");
                        }}
                      >
                        <span className="truncate">{c.name}</span>
                        <span className="shrink-0 text-xs text-text-muted">{tRarity(c.rarity as Rarity)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={ids.reason} className="text-sm">
            {t("reason")}
          </label>
          <input id={ids.reason} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} className={inputClass} />
          <p className="text-xs text-text-muted">{t("reasonHint")}</p>
        </div>
        <NoteField label={t("message")} placeholder={t("messagePlaceholder")} value={note} onChange={setNote} />

        <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-text-muted">{valid ? t("summary.line", { items: summary.join(" + "), count: registered }) : t("empty")}</p>
          {valid ? (
            <ConfirmAction
              label={t("send")}
              title={t("confirmTitle")}
              description={<p>{t("confirmBody", { items: summary.join(" + "), count: registered })}</p>}
              confirmLabel={t("confirm")}
              typeToConfirm={t("confirmWord")}
              onConfirm={async (typed) => {
                const r = await startDirectBroadcastAction({ rewards, reason, message: note, confirm: typed });
                if (!r.ok) return t(`errors.${r.error}`);
                setMessage({ tone: "ok", text: r.done === false ? t("partial", { count: r.granted ?? 0 }) : t("sent", { count: r.granted ?? 0 }) });
                return null;
              }}
            />
          ) : (
            <Button type="button" disabled>
              {t("send")}
            </Button>
          )}
        </div>
        <FormMessage message={message} />
        <Link href="/admin/lots" className="inline-flex min-h-11 items-center text-sm text-link underline underline-offset-4">
          {t("history")}
        </Link>
      </div>
    </details>
  );
}
