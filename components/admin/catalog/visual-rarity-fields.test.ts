import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import fr from "@/messages/fr.json";
import en from "@/messages/en.json";
import { blankCard } from "@/lib/catalog/admin-form";
import { BASE_DEFINITIONS } from "@/lib/catalog/definitions";
import { AppearanceFields } from "./AppearanceFields";
import { CardEditor } from "./CardEditor";

vi.mock("next-intl", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-intl")>();
  return {
    ...original,
    useLocale: () => "fr",
    useFormatter: () => original.createFormatter({ locale: "fr" }),
    useTranslations: (namespace: "admin.catalog" | "rarity" | "fuda" | "battle.board") => original.createTranslator({ locale: "fr", messages: fr, namespace, onError: () => {}, getMessageFallback: ({ key }) => key }),
  };
});
vi.mock("next/image", () => ({
  default: ({ src, alt, className }: { src: string; alt: string; className: string }) => createElement("img", { src, alt, className }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => createElement("a", { href }, children),
  useRouter: () => ({ replace() {}, refresh() {} }),
}));
vi.mock("@/server/actions/admin-catalog", () => ({ deleteCatalogCard: vi.fn(), saveCatalogCard: vi.fn(), setCatalogCardStatus: vi.fn() }));
vi.mock("./CardPreview", () => ({ CardPreview: () => null }));
vi.mock("./SearchPicker", () => ({ SearchPicker: () => null }));

const fields = (value: object, defaults?: object) => renderToStaticMarkup(createElement(AppearanceFields, { value, defaults, onChange: () => {} }));
const options = { rarities: BASE_DEFINITIONS, boosters: [], medians: {}, storageConfigured: true } as never;
const context = { series: null, base: null, variants: [], editable: true, deletable: false };
const editor = (rarity: string, appearance = {}) => renderToStaticMarkup(createElement(CardEditor, { scope: "full", initial: { ...blankCard("series"), rarity, appearance }, options, context }));

describe("réglages des raretés visuelles dans le CRUD", () => {
  it("propose le Full Art, et toujours l'holographie", () => {
    const html = fields({});
    expect(html).toContain(fr.admin.catalog.fullArt);
    expect(html).toContain(fr.admin.catalog.holographic);
  });
  it("n'affiche le détourage que sur une carte en Full Art", () => {
    expect(editor("XR")).toContain(fr.admin.catalog.cutoutHint);
    expect(editor("BR")).not.toContain(fr.admin.catalog.cutoutHint);
    expect(editor("XR", { fullArt: false })).not.toContain(fr.admin.catalog.cutoutHint);
    expect(editor("MR", { fullArt: true })).toContain(fr.admin.catalog.cutoutHint);
  });
  it("a ses textes dans les deux langues", () => {
    for (const key of ["fullArt", "cutout", "cutoutHint", "cutoutRemove"] as const) {
      expect(fr.admin.catalog[key]).toBeTruthy();
      expect(en.admin.catalog[key]).toBeTruthy();
    }
    expect(Object.keys(en.admin.catalog.artTones)).toEqual(Object.keys(fr.admin.catalog.artTones));
  });
});
