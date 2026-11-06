import { existsSync } from "node:fs";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ARENAS, type ArenaId } from "@/lib/battle/arenas";
import type { FxLevel } from "@/lib/battle/choreography";
import { ChikurinArena } from "./chikurin/ChikurinArena";
import { DojoArena } from "./dojo/DojoArena";
import { HimatsuriArena } from "./himatsuri/HimatsuriArena";
import type { ArenaProps } from "./shared";
import { SuiuArena } from "./suiu/SuiuArena";
import { TakamagaharaArena } from "./takamagahara/TakamagaharaArena";
import { TenshuArena } from "./tenshu/TenshuArena";
import { ToriiArena } from "./torii/ToriiArena";

const VIEWS: Record<ArenaId, ComponentType<ArenaProps>> = {
  dojo: DojoArena,
  chikurin: ChikurinArena,
  torii: ToriiArena,
  suiu: SuiuArena,
  tenshu: TenshuArena,
  himatsuri: HimatsuriArena,
  takamagahara: TakamagaharaArena,
};

const render = (id: ArenaId, level: FxLevel) => renderToStaticMarkup(createElement(VIEWS[id], { level, handleRef: () => {} }));
const videoTag = (html: string) => html.match(/<video[^>]*>/)?.[0] ?? "";

describe.each(ARENAS.map((id) => [id]))("arène %s", (id) => {
  it("joue sa vidéo en boucle, muette et intégrée à la page, par-dessus son image fixe", () => {
    const html = render(id, "full");
    expect(html).toContain(`src="/arenas/${id}/still-v1.webp"`);
    const video = videoTag(html);
    expect(video).toContain(`src="/arenas/${id}/loop-v1.mp4"`);
    expect(video).toContain(`poster="/arenas/${id}/still-v1.webp"`);
    expect(video).toMatch(/\smuted(=""|\s|>)/);
    expect(video).toMatch(/\sloop(=""|\s|>)/);
    expect(video).toMatch(/\splaysinline(=""|\s|>)/i);
    expect(video).not.toMatch(/\scontrols/);
  });

  it("garde la vidéo en effets allégés", () => {
    expect(videoTag(render(id, "lite"))).not.toBe("");
  });

  it("n'affiche que l'image fixe en mouvement réduit", () => {
    const html = render(id, "reduced");
    expect(html).not.toContain("<video");
    expect(html).toContain(`/arenas/${id}/still-v1.webp`);
  });

  it("a ses fichiers de décor dans public/arenas", () => {
    expect(existsSync(`public/arenas/${id}/loop-v1.mp4`)).toBe(true);
    expect(existsSync(`public/arenas/${id}/still-v1.webp`)).toBe(true);
  });
});

describe("jardin de jade", () => {
  it("embarque le koi détouré qui saute au KO", () => {
    expect(render("suiu", "full")).toContain('src="/arenas/suiu/koi-v1.webp"');
    expect(existsSync("public/arenas/suiu/koi-v1.webp")).toBe(true);
  });
});
