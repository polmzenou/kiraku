"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { BattleSetup, BattleState } from "@/lib/battle/types";
import type { BattleView, CandidateCard } from "@/lib/battle/view";
import { buttonClasses } from "../ui/Button";
import { RoomLobby } from "./RoomLobby";

// Plateau et replay chargés à la demande : ni le moteur ni Ably ne pèsent sur les autres pages
const Loading = () => <div className="mx-auto aspect-[3/4] w-full max-w-xl animate-pulse rounded-lg bg-surface motion-reduce:animate-none" />;
const BattleBoard = dynamic(() => import("./BattleBoard").then((m) => m.BattleBoard), { ssr: false, loading: Loading });
const BattleReplay = dynamic(() => import("./BattleReplay").then((m) => m.BattleReplay), { ssr: false, loading: Loading });

type Ready = BattleView & { setup: BattleSetup; state: BattleState };
const ready = (v: BattleView): v is Ready => v.setup !== null && v.state !== null;

/** /combat/[id] : salle d'attente, partie en direct ou replay selon l'état de la partie. */
export function BattleScreen({ view, candidates, lastTeam }: { view: BattleView; candidates: CandidateCard[]; lastTeam: string[] }) {
  const t = useTranslations("battle");
  if (view.status === "WAITING") return <RoomLobby view={view} candidates={candidates} lastTeam={lastTeam} />;
  if (view.status === "ACTIVE" && ready(view)) return <BattleBoard key={view.id} view={view} />;
  if (view.status === "FINISHED" && ready(view)) return <BattleReplay key={view.id} view={view} />;
  return (
    <section className="flex flex-col items-center gap-4 rounded-lg border border-border bg-surface px-4 py-8 text-center">
      <p>{t("room.closed")}</p>
      <Link href="/combat" className={buttonClasses("primary")}>
        {t("room.back")}
      </Link>
    </section>
  );
}
