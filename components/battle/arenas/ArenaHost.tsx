"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { ArenaId } from "@/lib/battle/arenas";
import type { ArenaProps } from "./shared";

// Une arène = un chunk chargé à la demande : seule celle du combat en cours est téléchargée. Les arènes
// pas encore peintes retombent sur le dōjō.

const Fallback = () => <div className="arena" style={{ background: "radial-gradient(ellipse at 50% 30%, #2a1d14, #0b0908 70%)" }} />;

const VIEWS: Partial<Record<ArenaId, ComponentType<ArenaProps>>> = {
  dojo: dynamic(() => import("./dojo/DojoArena").then((m) => m.DojoArena), { ssr: false, loading: Fallback }),
  torii: dynamic(() => import("./torii/ToriiArena").then((m) => m.ToriiArena), { ssr: false, loading: Fallback }),
};

export function ArenaHost({ id, ...props }: ArenaProps & { id: ArenaId }) {
  const View = VIEWS[id] ?? VIEWS.dojo!;
  return <View {...props} />;
}
