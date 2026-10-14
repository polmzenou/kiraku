"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RARITIES, type Rarity } from "@/lib/catalog/rarity";
import { lotInputSchema, MAX_LOT_ITEMS, MAX_LOT_QUANTITY, MAX_LOT_ZENI, type LotInput, type LotItemInput } from "@/lib/economy/lots";
import { searchFeaturedCards, type FeaturedCandidate } from "@/server/actions/admin-boosters";
import { saveLotAction } from "@/server/actions/admin-economy";
import { Button } from "../ui/Button";
import { FormMessage, inputClass, NumberField, SelectField, TextField, Toggle } from "./fields";

type Option = { id: string; name: string };

const EMPTY: LotInput = { name: { fr: "", en: "" }, zeni: 0, items: [], active: true };

/** Création ou modification d'un lot : Zeni, boosters d'un type, cartes précises ou tirées dans une rareté. */
export function LotForm({
  initial,
  boosterTypes,
  cardNames,
}: {
  initial: LotInput | null;
  boosterTypes: Option[];
  cardNames: Record<string, string>;
}) {
  const t = useTranslations("admin.economy");
  const tRarity = useTranslations("rarity");
  const router = useRouter();
  const [draft, setDraft] = useState<LotInput>(initial ?? EMPTY);
  const [names, setNames] = useState(cardNames);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FeaturedCandidate[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const valid = lotInputSchema.safeParse(draft).success;

  const setItem = (i: number, item: LotItemInput) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === i ? item : x)) });
  const removeItem = (i: number) => setDraft({ ...draft, items: draft.items.filter((_, j) => j !== i) });
  const addItem = (item: LotItemInput) => setDraft({ ...draft, items: [...draft.items, item] });

  const search = () =>
    startTransition(async () => {
      setResults(query.trim().length >= 2 ? await searchFeaturedCards(query) : []);
    });

  const save = () =>
    startTransition(async () => {
      try {
        const res = await saveLotAction(draft);
        if (res.ok) {
          setMessage({ tone: "ok", text: t("lotSaved") });
          if (!draft.id) setDraft(EMPTY);
          router.refresh();
        } else {
          setMessage({ tone: "error", text: t(`errors.${res.error}`) });
        }
      } catch {
        setMessage({ tone: "error", text: t("errors.unexpected") });
      }
    });

  const kindLabel = (kind: LotItemInput["kind"]) => t(`itemKinds.${kind}`);

  return (
    <form
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <h3 className="font-bold">{draft.id ? t("editLot") : t("newLot")}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label={t("nameFr")} value={draft.name.fr} maxLength={80} onChange={(fr) => setDraft({ ...draft, name: { ...draft.name, fr } })} invalid={!draft.name.fr.trim()} />
        <TextField label={t("nameEn")} value={draft.name.en} maxLength={80} onChange={(en) => setDraft({ ...draft, name: { ...draft.name, en } })} />
        <NumberField label={t("lotZeni")} value={draft.zeni} onChange={(zeni) => setDraft({ ...draft, zeni })} min={0} max={MAX_LOT_ZENI} />
        <Toggle label={t("active")} checked={draft.active} onChange={(active) => setDraft({ ...draft, active })} />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-bold">{t("lotItems")}</legend>
        {draft.items.length === 0 && <p className="text-sm text-text-muted">{t("lotItemsEmpty")}</p>}
        {draft.items.map((item, i) => (
          <div key={i} className="grid items-end gap-2 rounded-button border border-border p-3 sm:grid-cols-[1fr_8rem_auto]">
            {item.kind === "BOOSTER" && (
              <SelectField
                label={kindLabel("BOOSTER")}
                value={item.boosterTypeId}
                onChange={(boosterTypeId) => setItem(i, { ...item, boosterTypeId })}
                options={boosterTypes.map((b) => ({ value: b.id, label: b.name }))}
              />
            )}
            {item.kind === "CARD" && (
              <p className="flex min-h-11 items-center text-sm">
                {kindLabel("CARD")} : <strong className="ml-1">{names[item.cardId] ?? item.cardId}</strong>
              </p>
            )}
            {item.kind === "RARITY_CARD" && (
              <SelectField
                label={kindLabel("RARITY_CARD")}
                value={item.rarity}
                onChange={(rarity) => setItem(i, { ...item, rarity: rarity as Rarity })}
                options={RARITIES.map((r) => ({ value: r, label: tRarity(r) }))}
              />
            )}
            <NumberField label={t("quantity")} value={item.quantity} onChange={(quantity) => setItem(i, { ...item, quantity })} min={1} max={MAX_LOT_QUANTITY} />
            <Button type="button" onClick={() => removeItem(i)}>
              {t("remove")}
            </Button>
          </div>
        ))}

        {draft.items.length < MAX_LOT_ITEMS && (
          <div className="flex flex-wrap gap-2">
            {boosterTypes.length > 0 && (
              <Button type="button" onClick={() => addItem({ kind: "BOOSTER", boosterTypeId: boosterTypes[0].id, quantity: 1 })}>
                {t("addBooster")}
              </Button>
            )}
            <Button type="button" onClick={() => addItem({ kind: "RARITY_CARD", rarity: "RARE", quantity: 1 })}>
              {t("addRarityCard")}
            </Button>
          </div>
        )}

        {draft.items.length < MAX_LOT_ITEMS && (
          <div className="flex flex-col gap-2">
            <label htmlFor="lot-card-search" className="text-sm">
              {t("addCard")}
            </label>
            <div className="flex gap-2">
              <input
                id="lot-card-search"
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
                      className="flex min-h-11 w-full items-center justify-between gap-2 rounded-button border border-border px-3 text-left text-sm hover:border-shu"
                      onClick={() => {
                        setNames({ ...names, [c.id]: c.name });
                        addItem({ kind: "CARD", cardId: c.id, quantity: 1 });
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
          </div>
        )}
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
