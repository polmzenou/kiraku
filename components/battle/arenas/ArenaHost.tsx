"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { ArenaId } from "@/lib/battle/arenas";
import type { ArenaProps } from "./shared";

// Une arène = un chunk chargé à la demande : seule celle du combat en cours est téléchargée.

const Fallback = () => <div className="arena" style={{ background: "radial-gradient(ellipse at 50% 30%, #2a1d14, #0b0908 70%)" }} />;

const VIEWS: Record<ArenaId, ComponentType<ArenaProps>> = {
  dojo: dynamic(() => import("./dojo/DojoArena").then((m) => m.DojoArena), { ssr: false, loading: Fallback }),
  chikurin: dynamic(() => import("./chikurin/ChikurinArena").then((m) => m.ChikurinArena), { ssr: false, loading: Fallback }),
  torii: dynamic(() => import("./torii/ToriiArena").then((m) => m.ToriiArena), { ssr: false, loading: Fallback }),
  suiu: dynamic(() => import("./suiu/SuiuArena").then((m) => m.SuiuArena), { ssr: false, loading: Fallback }),
  tenshu: dynamic(() => import("./tenshu/TenshuArena").then((m) => m.TenshuArena), { ssr: false, loading: Fallback }),
  himatsuri: dynamic(() => import("./himatsuri/HimatsuriArena").then((m) => m.HimatsuriArena), { ssr: false, loading: Fallback }),
  takamagahara: dynamic(() => import("./takamagahara/TakamagaharaArena").then((m) => m.TakamagaharaArena), { ssr: false, loading: Fallback }),
};

export function ArenaHost({ id, ...props }: ArenaProps & { id: ArenaId }) {
  const View = VIEWS[id];
  return <View {...props} />;
}
