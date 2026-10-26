import { describe, expect, it } from "vitest";
import { breadcrumbs, homeGraph } from "./structured-data";

describe("homeGraph", () => {
  it("relie le site, l'éditeur et le jeu par leurs @id", () => {
    const [site, org, app] = homeGraph("https://k.test", "/en", { name: "Kiraku", description: "d", language: "en" });
    expect(site).toMatchObject({ "@type": "WebSite", name: "Kiraku-kun", alternateName: ["Kiraku", "気楽"], url: "https://k.test/en", publisher: { "@id": "https://k.test/#organization" } });
    expect(org).toMatchObject({ "@type": "Organization", "@id": "https://k.test/#organization", logo: "https://k.test/icons/icon-512.png", sameAs: ["https://x.com/kirakukuntcg"] });
    expect(app).toMatchObject({ "@type": "WebApplication", applicationCategory: "GameApplication", offers: { price: 0 } });
  });
});

describe("breadcrumbs", () => {
  it("numérote les éléments à partir de 1 avec des URL absolues", () => {
    expect(breadcrumbs("https://k.test", [{ name: "Kiraku", path: "/" }, { name: "Wiki", path: "/wiki" }])).toEqual({
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Kiraku", item: "https://k.test/" },
        { "@type": "ListItem", position: 2, name: "Wiki", item: "https://k.test/wiki" },
      ],
    });
  });
});
