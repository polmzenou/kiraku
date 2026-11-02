import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import fr from "@/messages/fr.json";
import type { OpenedCardView } from "@/lib/boosters/view";
import { BASE_DEFINITIONS } from "@/lib/catalog/definitions";
import { FlipCard, type FlipPhase } from "./RevealCard";
import { momentTint, RevealOverlay, RevealTitle, type Moment } from "./RevealMoment";

vi.mock("next-intl", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-intl")>();
  return { ...original, useLocale: () => "fr", useTranslations: (namespace: "rarity" | "fuda" | "opening" | "battle.board") => original.createTranslator({ locale: "fr", messages: fr, namespace, onError: () => {}, getMessageFallback: ({ key }) => key }) };
});
vi.mock("next/image", () => ({
  default: ({ src, alt, className }: { src: string; alt: string; className: string }) => createElement("img", { src, alt, className }),
}));
vi.mock("motion/react", async (importOriginal) => {
  const original = await importOriginal<typeof import("motion/react")>();
  const plain = (tag: string) => {
    const Plain = ({ children, className, style }: { children?: ReactNode; className?: string; style?: object }) => createElement(tag, { className, style }, children);
    return Plain;
  };
  return { ...original, m: { div: plain("div"), span: plain("span") } };
});

const card = (rarity: string): OpenedCardView => ({
  name: "Luffy", nameNative: null, imageUrl: "https://s4.anilist.co/luffy.png", rank: 3, rarity, power: 90, ki: 70, appearance: {},
  series: "One Piece", anilistId: 1, cardId: "c", userCardId: "u", isNew: false, featured: false,
}) as OpenedCardView;
const flip = (rarity: string, phase: FlipPhase, props: object = {}) =>
  renderToStaticMarkup(createElement(FlipCard, { card: card(rarity), phase, size: "lg", reduced: false, scene: true, ...props }));
const moment = (rarity: string): Moment => {
  const def = BASE_DEFINITIONS.find((d) => d.key === rarity)!;
  return { id: "u", rarity, color: "#123456", seal: def.seal, name: def.nameFr };
};

describe("carte d'une rareté visuelle dans la pile", () => {
  it("prend sa mise en scène dès la charge", () => {
    for (const key of ["BR", "MR", "VR", "XR"]) expect(flip(key, "charging")).toContain(`rv-card-${key}`);
    expect(flip("XR", "back")).not.toContain("rv-card-XR");
  });
  it("garde la cérémonie Mythique hors de la pile, en mouvement réduit et pour les autres raretés", () => {
    expect(flip("XR", "charging", { scene: false })).not.toContain("rv-card");
    expect(flip("BR", "front", { scene: false })).toContain("light-rays");
    expect(flip("XR", "charging", { reduced: true })).not.toContain("rv-card");
    expect(flip("MYTHIC", "charging")).not.toContain("rv-card");
    expect(flip("AR", "charging")).not.toContain("rv-card");
  });
  it("laisse l'apparition simple à une carte réglée en fondu", () => {
    const html = renderToStaticMarkup(createElement(FlipCard, { card: { ...card("VR"), appearance: { reveal: "fade" } }, phase: "charging", size: "lg", reduced: false, scene: true }));
    expect(html).not.toContain("rv-card");
  });
  it("le liseré du BR est porté par la carte, et le reflet du XR aussi", () => {
    expect(flip("BR", "front")).toContain("box-shadow:0 0 0 2px rgb(209 205 204 / 0.5)");
    expect(flip("MR", "front")).not.toContain("box-shadow:0 0 0 2px");
    expect(flip("XR", "front")).toContain("rv-xr-foil");
    expect(flip("XR", "charging")).not.toContain("rv-xr-foil");
  });
  it("seule la XR arrive du fond du tunnel avec ses échos", () => {
    expect(flip("XR", "charging")).toContain("rv-xr-echo");
    expect(flip("XR", "charging", { compactFx: true })).not.toContain("rv-xr-echo");
    expect(flip("BR", "charging")).not.toContain("rv-xr-echo");
  });
});

describe("grand moment des raretés visuelles", () => {
  it("la XR n'a ni sceau géant ni éclair, le BR son sceau sans éclair, le VR les deux", () => {
    const overlay = (rarity: string) => renderToStaticMarkup(createElement(RevealOverlay, { moment: moment(rarity) }));
    expect(overlay("XR")).toBe("");
    expect(overlay("BR")).toContain("moment-hanko-stamp");
    expect(overlay("BR")).not.toContain("moment-flash");
    expect(overlay("VR")).toContain("moment-flash");
    expect(overlay("MR")).toContain("data-paper");
    expect(overlay("MR")).toContain("--moment:#c8372d");
  });
  it("garde le grand moment habituel pour l'aperçu de la fiche et les autres raretés", () => {
    const contained = renderToStaticMarkup(createElement(RevealOverlay, { moment: moment("XR"), contained: true }));
    expect(contained).toContain("moment-hanko-stamp");
    expect(contained).toContain("moment-flash");
    expect(renderToStaticMarkup(createElement(RevealOverlay, { moment: moment("MYTHIC") }))).toContain("moment-flash");
    expect(momentTint("#123456").background).toContain("#123456");
  });
  it("le nom suit le déroulé de la scène seulement dans la pile", () => {
    const title = (scene: boolean) => renderToStaticMarkup(createElement(RevealTitle, { moment: moment("XR"), scene }));
    expect(title(true)).toContain("--d:0.29s");
    expect(title(true)).toContain("data-chroma");
    expect(title(false)).toContain("--d:0.85s");
    expect(title(false)).not.toContain("data-chroma");
  });
});
