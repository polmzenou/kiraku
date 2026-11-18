"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { copiesOfCardAction, type CardCopies } from "@/server/actions/collection";

/**
 * Exemplaire d'une carte qui part (vente, cadeau, annonce, offre, échange, mise). Tant que le joueur n'a que des
 * exemplaires ordinaires, rien ne s'affiche : le serveur en choisit un. S'il a des exemplaires spéciaux (héritiers
 * ou gravés), il choisit lequel part ; le serveur ne prend jamais une pièce spéciale tout seul (CHOOSE_COPY).
 * `value` : l'exemplaire désigné, ou null pour « un exemplaire ordinaire ».
 */
export function CopyPicker({ cardId, value, onChange }: { cardId: string; value: string | null; onChange: (userCardId: string | null) => void }) {
  const t = useTranslations("collection.copyPicker");
  // Exemplaires lus, avec la carte à laquelle ils appartiennent : au changement de carte, l'ancienne liste ne s'affiche plus
  const [loaded, setLoaded] = useState<{ cardId: string; copies: CardCopies } | null>(null);
  const copies = loaded?.cardId === cardId ? loaded.copies : null;
  const name = useId();

  useEffect(() => {
    let live = true;
    copiesOfCardAction({ cardId })
      .then((res) => {
        if (!live || !res.ok) return;
        setLoaded({ cardId, copies: res.copies });
        // Sans exemplaire ordinaire, on ne présélectionne rien : le joueur choisit la pièce qui part
        if (res.copies.ordinary === 0 && res.copies.special.length > 0) onChange(null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // onChange vient du parent, souvent recréé à chaque rendu : on ne relit qu'au changement de carte
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  if (!copies || copies.special.length === 0) return null;
  const option = (id: string | null, label: string, hint?: string) => (
    <label key={id ?? "ordinary"} className="flex min-h-11 items-center gap-3 rounded-control border border-border px-3 py-2 text-sm has-checked:border-kin">
      <input type="radio" name={name} className="size-4 accent-kin" checked={value === id} onChange={() => onChange(id)} />
      <span className="min-w-0 flex-1">{label}</span>
      {hint && <span className="text-xs font-bold text-kin">{hint}</span>}
    </label>
  );
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-bold">{t("title")}</legend>
      {copies.ordinary > 0 && option(null, t("ordinary", { count: copies.ordinary }))}
      {copies.special.map((c) =>
        option(
          c.userCardId,
          c.printing !== null
            ? c.size !== null
              ? t("engravedOf", { seal: c.seal ?? "", serial: c.serial ?? 0, size: c.size })
              : t("engraved", { serial: c.serial ?? 0 })
            : t("heir", { level: c.heritage }),
          c.printing !== null && c.heritage > 0 ? t("heirToo", { level: c.heritage }) : undefined,
        ),
      )}
      {value !== null && <p className="text-xs text-shu">{t("warning")}</p>}
      {value === null && copies.ordinary === 0 && <p className="text-xs text-text-muted">{t("choose")}</p>}
    </fieldset>
  );
}
