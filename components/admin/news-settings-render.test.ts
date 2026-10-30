import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import fr from "@/messages/fr.json";
import { NEWS_DEFAULT } from "@/lib/home/news-schema";

vi.mock("@/server/actions/admin-settings", () => ({ updateNewsSettings: vi.fn() }));
vi.mock("@/i18n/navigation", async () => {
  const { createElement: h } = await import("react");
  return { Link: (props: Record<string, unknown>) => h("a", props), useRouter: () => ({ refresh() {} }) };
});
const { NewsSettingsForm } = await import("./NewsSettingsForm");
const providerProps = { locale: "fr" as const, messages: fr, timeZone: "Europe/Paris", children: null };

describe("formulaire admin des Nouveautés", () => {
  it("présente chaque nouveauté, l'aperçu et la case de réouverture cochée", () => {
    const html = renderToStaticMarkup(
      createElement(NextIntlClientProvider, providerProps, createElement(NewsSettingsForm, { initial: { "home.news": NEWS_DEFAULT } })),
    );
    NEWS_DEFAULT.items.forEach((_, i) => expect(html).toContain(`Nouveauté ${i + 1}`));
    expect(html).toContain(`Nouveautés (${NEWS_DEFAULT.items.length}/6)`);
    // L'aperçu reprend l'encart de l'accueil
    expect(html).toContain("Kiraku-kun v2.5");
    expect(html).toContain("Mis à jour le 30 octobre");
    expect(html).toMatch(/<input type="checkbox" class="choice" checked=""\/><span>Rouvrir l&#x27;encart/);
  });
});
