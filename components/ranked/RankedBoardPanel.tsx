"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import type { DivisionBoard, RankedEntry } from "@/server/ranked/queries";
import { PlayerRow } from "../social/PlayerRow";
import { segmentedItemClass, segmentedTrackClass } from "../ui/Segmented";
import { useRankName } from "./RankBadge";
import { RankEmblem } from "./RankEmblem";

type Tab = "top" | "division";

/**
 * Classement du classé dans la vue Combat : onglet « Top » (classement général de la saison) et
 * « Ma division » (joueurs du même rang et de la même division, le joueur mis en avant).
 * Les deux listes arrivent du serveur ; changer d'onglet ne recharge rien.
 */
export function RankedBoardPanel({ top, division, viewer }: { top: RankedEntry[]; division: DivisionBoard; viewer: string }) {
  const t = useTranslations("ranked");
  const name = useRankName();
  const [tab, setTab] = useState<Tab>("top");
  const panelId = useId();
  const list = useRef<HTMLOListElement>(null);
  const entries = tab === "top" ? top : division.entries;
  const selfIndex = division.entries.findIndex((e) => e.self);

  // Ma division : la liste défile jusqu'au joueur (sa ligne au milieu)
  useEffect(() => {
    const box = list.current;
    if (tab !== "division" || !box || selfIndex < 0) return;
    const row = box.children[selfIndex] as HTMLElement | undefined;
    if (row) box.scrollTop = row.offsetTop - box.clientHeight / 2 + row.clientHeight / 2;
  }, [tab, selfIndex]);

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label={t("panel.title")} className={segmentedTrackClass}>
        {(["top", "division"] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            aria-controls={panelId}
            onClick={() => setTab(key)}
            className={segmentedItemClass}
          >
            {key === "top" ? t("panel.top", { count: top.length }) : t("panel.division")}
          </button>
        ))}
      </div>

      <div id={panelId} role="tabpanel" className="flex flex-col gap-2">
        {tab === "division" && (
          <p className="flex items-center gap-2 text-sm font-bold">
            <RankEmblem tier={division.tier} division={division.division} size={28} />
            {t("panel.divisionCount", { rank: name(division.tier, division.division), count: division.total })}
          </p>
        )}
        {entries.length === 0 ? (
          <p className="text-sm text-text-muted">{t("board.empty")}</p>
        ) : (
          <ol
            ref={list}
            tabIndex={0}
            aria-label={tab === "top" ? t("panel.top", { count: top.length }) : t("panel.division")}
            className="relative flex max-h-[26rem] flex-col overflow-y-auto overscroll-contain lacquer rounded-card px-2 [scrollbar-gutter:stable]"
          >
            {entries.map((e) => {
              const self = "self" in e ? e.self : e.username === viewer;
              return (
                <PlayerRow
                  key={e.username}
                  player={{ username: e.username, image: e.image, isGuest: false, decor: e.decor }}
                  detail={`${self ? `${t("panel.you")} · ` : ""}${name(e.tier, e.division)} · ${t("pc", { pc: e.pc })}`}
                  className={self ? "bg-shu/10 ring-1 ring-shu/50 ring-inset" : ""}
                >
                  <RankEmblem tier={e.tier} division={e.division} size={28} />
                  <span className="w-10 text-right font-title text-lg font-extrabold tabular-nums text-text-muted">{e.position}</span>
                </PlayerRow>
              );
            })}
          </ol>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
          <span>{t("board.hidden")}</span>
          <Link href="/classement?vue=classe" prefetch={false} className="inline-flex min-h-11 items-center font-bold text-text underline-offset-2 hover:underline">
            {t("panel.seeAll")}
          </Link>
        </div>
      </div>
    </div>
  );
}
