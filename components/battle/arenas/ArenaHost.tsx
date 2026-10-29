"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { ArenaId } from "@/lib/battle/arenas";
import type { ArenaProps } from "./shared";

// Une arène = un chunk chargé à la demande : seule celle du combat en cours est téléchargée.

const Fallback = () => <div className="arena" style={{ background: "radial-gradient(ellipse at 50% 30%, #2a1d14, #0b0908 70%)" }} />;
const opts = { ssr: false, loading: Fallback } as const;

const VIEWS: Record<ArenaId, ComponentType<ArenaProps>> = {
  dojo: dynamic(() => import("./dojo/DojoArena").then((m) => m.DojoArena), opts),
  chikurin: dynamic(() => import("./chikurin/ChikurinArena").then((m) => m.ChikurinArena), opts),
  torii: dynamic(() => import("./torii/ToriiArena").then((m) => m.ToriiArena), opts),
  suiu: dynamic(() => import("./suiu/SuiuArena").then((m) => m.SuiuArena), opts),
  tenshu: dynamic(() => import("./tenshu/TenshuArena").then((m) => m.TenshuArena), opts),
  himatsuri: dynamic(() => import("./himatsuri/HimatsuriArena").then((m) => m.HimatsuriArena), opts),
  takamagahara: dynamic(() => import("./takamagahara/TakamagaharaArena").then((m) => m.TakamagaharaArena), opts),
};

export function ArenaHost({ id, ...props }: ArenaProps & { id: ArenaId }) {
  const View = VIEWS[id];
  return <View {...props} />;
}
