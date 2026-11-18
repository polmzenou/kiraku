import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import fr from "@/messages/fr.json";
import { VerifySheet } from "./VerifySheet";

const providerProps = { locale: "fr" as const, messages: fr, timeZone: "Europe/Paris", children: null };
const SEED = "4893889a41621ff013b910cc4b0e4a1539fa2f7b11384812180dd176d43c6203";
const HASH = "1b44f944186c6fbce8d125a265771e3ef7b3d33b04a3e442c833b3f99a53a497";

describe("vérification du tirage", () => {
  it("montre l'empreinte et la graine par groupes de 8, sans police à chasse fixe", () => {
    const html = renderToStaticMarkup(
      createElement(NextIntlClientProvider, providerProps, createElement(VerifySheet, { open: true, onClose() {}, flipId: "t1", seed: SEED, seedHash: HASH, result: "OMOTE" })),
    );
    expect(html).toContain("Vérifier le tirage");
    expect(html).toContain("1b44f944 186c6fbc e8d125a2");
    expect(html).toContain("4893889a 41621ff0");
    expect(html).toContain("HMAC-SHA256(graine, table)");
    expect(html).toContain("table t1");
    expect(html).not.toMatch(/<code|font-mono/);
  });
});
