"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, domAnimation, LazyMotion, m } from "motion/react";
import { Fuda } from "@/components/fuda/Fuda";
import { FlipCard, type FlipPhase } from "@/components/opening/RevealCard";
import { momentTint, RevealOverlay, RevealTitle, TINT_DELAY, useMomentFor } from "@/components/opening/RevealMoment";
import type { CardDraft } from "@/lib/catalog/admin-form";
import type { OpenedCardView } from "@/lib/boosters/view";
import { useReducedFx } from "@/components/motion/MotionPreference";

/** Révélation rejouée dans le panneau : retournement, effets de rareté et grand moment (contenu dans l'aperçu). */
function Reveal({ card }: { card: OpenedCardView }) {
  const [phase, setPhase] = useState<FlipPhase>("back");
  const reduced = useReducedFx();
  const moment = useMomentFor()(card.userCardId, card.rarity);
  const front = phase === "front";
  useEffect(() => { const timer = window.setTimeout(() => setPhase("front"), 150); return () => clearTimeout(timer); }, []);
  return <LazyMotion features={domAnimation} strict>
    <AnimatePresence>
      {front && moment && <m.span key="tint" aria-hidden="true" className="pointer-events-none absolute inset-0" style={momentTint(moment.color)}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7, delay: reduced ? 0 : TINT_DELAY }} />}
    </AnimatePresence>
    <div className="relative flex min-h-14 flex-col items-center justify-end pb-3">{front && moment && <RevealTitle moment={moment} />}</div>
    <div className="relative"><FlipCard card={card} phase={phase} size="lg" reduced={reduced} /></div>
    {front && moment && !reduced && <RevealOverlay moment={moment} contained />}
  </LazyMotion>;
}
export function CardPreview({ draft, series, imageUrl }: { draft: CardDraft; series: string; imageUrl?: string }) {
  const t = useTranslations("admin.catalog");
  const [replay, setReplay] = useState(0);
  const card: OpenedCardView = { ...draft, name: draft.name || t("previewName"), rank: null,
    imageUrl: imageUrl || draft.imageUrl || "/icons/icon-512.png", series, anilistId: 0, cardId: "preview", userCardId: "preview", isNew: false, featured: false };
  return <aside className="top-4 flex min-w-0 flex-col gap-4 self-start rounded-card border border-border bg-surface p-5 lg:sticky" aria-label={t("preview")}>
    <div><h3 className="font-title text-xl font-bold">{t("preview")}</h3><p className="mt-1 text-xs text-text-muted">{t("previewHint")}</p></div>
    <div className="relative isolate -mx-5 overflow-hidden px-5 py-4">
      <div className="mx-auto w-full max-w-[280px]">{replay ? <Reveal key={replay} card={card} /> : <Fuda card={card} series={series} size="lg" />}</div>
    </div>
    <button type="button" onClick={() => setReplay((n) => n + 1)} className="min-h-11 rounded-control border border-border px-3 text-sm font-bold">{t("replay")}</button>
    {draft.description.fr && <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-sm text-text-muted">{draft.description.fr}</p>}
  </aside>;
}
