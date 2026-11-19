"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { CardView } from "@/lib/boosters/view";
import type { RebirthBoosterView } from "@/lib/prestige/cinematic";
import type { FrameStyle } from "@/lib/profile/frames";
import type { RebirthResultView } from "@/server/actions/prestige";
import type { RarityInfo, RiteStyle } from "../prestige/RebirthFlow";
import { Button } from "../ui/Button";
import { NumberField, Toggle } from "./fields";

// Les deux rites ne sont chargés qu'au premier essai
const RebirthRite = dynamic(() => import("../prestige/RebirthRite").then((m) => m.RebirthRite), { ssr: false });
const RebirthCinematic = dynamic(() => import("../prestige/RebirthCinematic").then((m) => m.RebirthCinematic), { ssr: false });

type Draft = { prestige: number; zeni: number; heirs: number; printings: boolean; booster: boolean };

/** Cartes parties factices : beaucoup de Communes, de moins en moins vers les raretés hautes, une Mythique au moins. */
function fakeDeparted(rarities: readonly RarityInfo[]) {
  return rarities.slice(0, 8).map((r, i) => ({ rarity: r.key, engraved: false, count: Math.max(1, Math.round(900 / (i + 1) ** 1.7)) }));
}

/**
 * Banc des rites de renaissance : joue le rite d'encre ou la cinématique avec un résultat factice (vraies cartes pour
 * les héritières, vrai booster du réglage), sans rien écrire en base. Le rite se ferme par son bouton « Fermer ».
 */
export function RitePreviewBench({
  rarities,
  cards,
  booster,
  boosters,
  player,
  current,
}: {
  rarities: RarityInfo[];
  cards: CardView[];
  booster: RebirthBoosterView | null;
  /** Boosters réellement offerts par renaissance (réglage). */
  boosters: number;
  player: { username: string; image: string | null; frame: FrameStyle | null; prestige: number; agreement: "MASC" | "FEM" };
  /** Rite actuellement joué après une vraie renaissance. */
  current: RiteStyle;
}) {
  const t = useTranslations("admin.prestige.ritePreview");
  const tStyle = useTranslations("admin.prestige.riteStyles");
  const [draft, setDraft] = useState<Draft>({
    prestige: Math.max(1, player.prestige + 1),
    zeni: 184_250,
    heirs: Math.min(20, cards.length),
    printings: true,
    booster: booster !== null && boosters > 0,
  });
  const [playing, setPlaying] = useState<{ style: RiteStyle; result: RebirthResultView; run: number } | null>(null);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const play = (style: RiteStyle) => {
    // Champ vide ou hors bornes : ramené dans les bornes plutôt que de casser l'essai
    const clamp = (v: number, min: number, max: number) => (Number.isFinite(v) ? Math.min(max, Math.max(min, Math.trunc(v))) : min);
    const result: RebirthResultView = {
      prestige: clamp(draft.prestige, 1, 60),
      globalRank: 42,
      zeni: clamp(draft.zeni, 0, 10_000_000),
      coins: 0,
      departed: fakeDeparted(rarities),
      heirs: cards.slice(0, clamp(draft.heirs, 0, 20)).map((card, i) => {
        const before = i % 3;
        return { userCardId: `preview-${i}`, cardId: card.cardId, before, after: before + 1, printing: null, serial: null, card };
      }),
      booster: draft.booster && booster ? { ...booster, count: Math.max(1, boosters) } : null,
      printingsUnlocked: draft.printings,
    };
    setPlaying((p) => ({ style, result, run: (p?.run ?? 0) + 1 }));
  };
  const close = () => setPlaying(null);

  return (
    <div className="flex flex-col gap-4 lacquer rounded-card p-4">
      <p className="text-sm">{t("current", { style: tStyle(current) })}</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <NumberField label={t("prestige")} value={draft.prestige} min={1} max={60} onChange={(v) => set("prestige", v)} />
        <NumberField label={t("zeni")} value={draft.zeni} min={0} max={10_000_000} onChange={(v) => set("zeni", v)} />
        <NumberField label={t("heirs")} value={draft.heirs} min={0} max={Math.min(20, cards.length)} onChange={(v) => set("heirs", v)} />
      </div>
      <div className="flex flex-wrap gap-x-6">
        <Toggle label={t("printings")} checked={draft.printings} onChange={(v) => set("printings", v)} />
        {booster && <Toggle label={t("booster", { name: booster.name })} checked={draft.booster} onChange={(v) => set("booster", v)} />}
      </div>
      {!booster && <p className="text-xs text-shu">{t("noBooster")}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="primary" onClick={() => play("CINEMATIC")}>
          {t("playCinematic")}
        </Button>
        <Button type="button" onClick={() => play("INK")}>
          {t("playInk")}
        </Button>
      </div>
      <p className="text-xs text-text-muted">{t("hint")}</p>

      {playing &&
        (playing.style === "CINEMATIC" ? (
          <RebirthCinematic key={playing.run} result={playing.result} rarities={rarities} username={player.username} agreement={player.agreement} onClose={close} />
        ) : (
          <RebirthRite
            key={playing.run}
            result={playing.result}
            previous={Math.max(0, playing.result.prestige - 1)}
            rarities={rarities}
            player={{ username: player.username, image: player.image, frame: player.frame }}
            onClose={close}
          />
        ))}
    </div>
  );
}
