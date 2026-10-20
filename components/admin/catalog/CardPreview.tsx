"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { domAnimation, LazyMotion, useReducedMotion } from "motion/react";
import { Fuda } from "@/components/fuda/Fuda";
import { FlipCard, type FlipPhase } from "@/components/opening/RevealCard";
import type { CardDraft } from "@/lib/catalog/admin-form";
import type { OpenedCardView } from "@/lib/boosters/view";

function Reveal({ card }: { card: OpenedCardView }) {
  const [phase, setPhase] = useState<FlipPhase>("back");
  const reduced = useReducedMotion();
  useEffect(() => { const timer = window.setTimeout(() => setPhase("front"), 150); return () => clearTimeout(timer); }, []);
  return <LazyMotion features={domAnimation} strict><FlipCard card={card} phase={phase} size="lg" reduced={Boolean(reduced)} /></LazyMotion>;
}
export function CardPreview({ draft, series, imageUrl }: { draft: CardDraft; series: string; imageUrl?: string }) {
  const t = useTranslations("admin.catalog");
  const [replay, setReplay] = useState(0);
  const card: OpenedCardView = { ...draft, name: draft.name || t("previewName"), rank: null,
    imageUrl: imageUrl || draft.imageUrl || "/icons/icon-512.png", series, anilistId: 0, cardId: "preview", userCardId: "preview", isNew: false, featured: false };
  return <aside className="top-4 flex min-w-0 flex-col gap-4 self-start rounded-card border border-border bg-surface p-5 lg:sticky" aria-label={t("preview")}>
    <div><h3 className="font-title text-xl font-bold">{t("preview")}</h3><p className="mt-1 text-xs text-text-muted">{t("previewHint")}</p></div>
    <div className="mx-auto w-full max-w-[280px] py-4">{replay ? <Reveal key={replay} card={card} /> : <Fuda card={card} series={series} size="lg" />}</div>
    <button type="button" onClick={() => setReplay((n) => n + 1)} className="min-h-11 rounded-control border border-border px-3 text-sm font-bold">{t("replay")}</button>
    {draft.description.fr && <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-sm text-text-muted">{draft.description.fr}</p>}
  </aside>;
}
