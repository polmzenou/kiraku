import { getFormatter, getTranslations } from "next-intl/server";
import { ownedCardIds } from "@/server/collection/owned";
import { WishMissingButton } from "./WishMissingButton";

/**
 * Sous la vitrine d'un autre joueur, pour un visiteur connecté : la part de ces cartes déjà dans sa
 * collection, et l'ajout des autres à sa liste de souhaits.
 */
export async function VisitorShowcaseBar({ viewerId, cardIds }: { viewerId: string | null; cardIds: readonly string[] }) {
  if (!viewerId || cardIds.length === 0) return null;
  const [owned, t, format] = await Promise.all([ownedCardIds(viewerId, cardIds), getTranslations("showcase"), getFormatter()]);
  const have = new Set(owned);
  const missing = cardIds.filter((id) => !have.has(id));
  const share = format.number(have.size / cardIds.length, { style: "percent", maximumFractionDigits: 0 });
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm">{t("visitor.inCollection", { owned: have.size, total: cardIds.length })}</p>
        <span className="shrink-0 font-title text-lg font-extrabold tabular-nums text-kin">{share}</span>
      </div>
      <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full origin-left rounded-full bg-kin" style={{ transform: `scaleX(${have.size / cardIds.length})` }} />
      </div>
      {missing.length > 0 && <WishMissingButton cardIds={missing} />}
    </div>
  );
}
