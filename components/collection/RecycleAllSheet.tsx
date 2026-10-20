"use client";

import { useRarities, useRaritySeals } from "@/lib/catalog/use-rarities";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { type Rarity } from "@/lib/catalog/rarity";
import type { CollectionSummary } from "@/lib/collection/view";
import { recycleAllAction } from "@/server/actions/collection";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { useCollectionStore } from "./CollectionStore";
import { selectClass } from "../ui/Field";

/**
 * « Recycler les doublons » : choix de la rareté la plus haute (Épique par défaut, pour ne jamais
 * toucher aux Légendaires et Mythiques sans le vouloir), récap par rareté, puis confirmation.
 * Le serveur recalcule tout et refuse si le gain n'est plus celui affiché.
 */
export function RecycleAllSheet({ byRarity }: { byRarity: CollectionSummary["byRarity"] }) {
  const RARITIES = useRarities();
  const RARITY_SEAL = useRaritySeals();
  const t = useTranslations("collection.recycleAll");
  const tRarity = useTranslations("rarity");
  const router = useRouter();
  const { reset } = useCollectionStore();
  const [open, setOpen] = useState(false);
  const [maxRarity, setMaxRarity] = useState<Rarity>("EPIC");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const selectId = useId();

  const included = RARITIES.slice(0, RARITIES.indexOf(maxRarity) + 1);
  const copies = included.reduce((s, r) => s + byRarity[r].recyclable, 0);
  const zeni = included.reduce((s, r) => s + byRarity[r].zeni, 0);
  const total = RARITIES.reduce((s, r) => s + byRarity[r].recyclable, 0);

  const confirm = () =>
    startTransition(async () => {
      try {
        const res = await recycleAllAction({ maxRarity, expected: zeni });
        if (!res.ok) {
          setMessage({ tone: "error", text: t(`errors.${res.error}`) });
          if (res.error === "STALE" || res.error === "NOTHING") router.refresh();
          return;
        }
        reset();
        setMessage({ tone: "ok", text: t("done", { count: res.recycled, zeni: res.gain }) });
      } catch {
        setMessage({ tone: "error", text: t("errors.UNAVAILABLE") });
      }
    });

  return (
    <>
      <Button
        type="button"
        disabled={total === 0}
        onClick={() => {
          setMessage(null);
          setOpen(true);
        }}
        aria-haspopup="dialog"
      >
        {t("open")}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t("title")}>
        <p className="text-sm text-text-muted">{t("intro")}</p>
        <div className="flex flex-col gap-1">
          <label htmlFor={selectId} className="text-sm font-bold">
            {t("upTo")}
          </label>
          <select
            id={selectId}
            value={maxRarity}
            onChange={(e) => {
              setMaxRarity(e.target.value as Rarity);
              setMessage(null);
            }}
            className={selectClass}
          >
            {RARITIES.map((r) => (
              <option key={r} value={r}>
                {RARITY_SEAL[r]} {tRarity(r)}
              </option>
            ))}
          </select>
        </div>

        <table className="w-full text-sm">
          <caption className="sr-only">{t("recap")}</caption>
          <thead>
            <tr className="text-left text-xs text-text-muted">
              <th scope="col" className="py-1 font-normal">{t("rarity")}</th>
              <th scope="col" className="py-1 text-right font-normal">{t("copies")}</th>
              <th scope="col" className="py-1 text-right font-normal">{t("zeni")}</th>
            </tr>
          </thead>
          <tbody>
            {[...included].reverse().map((r) => (
              <tr key={r} className="border-t border-border">
                <th scope="row" className="py-2 text-left font-normal">
                  <span aria-hidden="true" className="font-seal">{RARITY_SEAL[r]}</span> {tRarity(r)}
                </th>
                <td className="py-2 text-right tabular-nums">{byRarity[r].recyclable}</td>
                <td className="py-2 text-right tabular-nums text-kin">{byRarity[r].zeni}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-bold">
              <th scope="row" className="py-2 text-left">{t("total")}</th>
              <td className="py-2 text-right tabular-nums">{copies}</td>
              <td className="py-2 text-right tabular-nums text-kin">{zeni}</td>
            </tr>
          </tfoot>
        </table>
        <p className="text-xs text-text-muted">{t("keepOne")}</p>

        {message && (
          <p role="status" className={`text-sm ${message.tone === "ok" ? "text-text" : "text-shu"}`}>
            {message.text}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button type="button" onClick={() => setOpen(false)} disabled={pending}>
            {t("cancel")}
          </Button>
          <Button type="button" variant="primary" onClick={confirm} disabled={pending || copies === 0}>
            {t("confirm", { zeni })}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
