import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { SectionTitle } from "@/components/SectionTitle";
import "@/components/shop/shop.css";
import { PreviewBuy } from "@/components/shop/PreviewBuy";
import { ShopNoren } from "@/components/shop/ShopNoren";
import { ShopShelves } from "@/components/shop/ShopShelves";
import { ShopStage } from "@/components/shop/ShopStage";
import { contentsLabel } from "@/lib/boosters/catalog";
import { isRotatingFamily, ROTATING_FAMILIES, rotationSelection, rotationWindow, type RotatingFamily } from "@/lib/boosters/rotation";
import { effectiveSlotFloors, localize } from "@/lib/boosters/types";
import { BASE_RARITIES } from "@/lib/catalog/rarity";
import { periodWindow } from "@/lib/economy/period";
import { buildShopView, purchaseKey, shopLotFrom, type ShopBoosterType, type ShopCard } from "@/lib/economy/shop-view";
import { SETTING_DEFAULTS } from "@/lib/settings/defaults";
import { BOOSTER_SEEDS } from "@/prisma/seed/booster-types";
import { shopPackSeeds } from "@/prisma/seed/economy";
import type { LotView } from "@/server/economy/lot-view";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const COINS = 12_345;

/**
 * Aperçu de la boutique pour le développement (npm run dev) : les packs des seeds avec des compteurs
 * factices, sans aucune lecture ni écriture en base (la base locale est la prod). « Rejouer l'achat »
 * lance la célébration sans rien acheter. Introuvable hors développement.
 */
export default async function ShopPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  const [t, tRarity, locale] = await Promise.all([getTranslations("economy.shop"), getTranslations("rarity"), getLocale()]);
  const timeZone = SETTING_DEFAULTS["game.timeZone"];
  const now = new Date();
  const week = periodWindow("WEEKLY", now, timeZone);
  const globalFloors = SETTING_DEFAULTS["booster.slotFloors"];

  // Sélection du moment calculée comme en prod (réglages par défaut, sans épingle de l'admin)
  const hours = SETTING_DEFAULTS["booster.rotationHours"];
  const rotation = rotationWindow(now, hours, timeZone);
  const offered = (s: (typeof BOOSTER_SEEDS)[number]) => s.active !== false && s.kind !== "DROP";
  const selection = rotationSelection({
    candidates: Object.fromEntries(
      ROTATING_FAMILIES.map((f) => [f, BOOSTER_SEEDS.filter((s) => s.family === f && offered(s)).map((s) => s.slug)]),
    ) as Record<RotatingFamily, string[]>,
    counts: { demographie: SETTING_DEFAULTS["booster.rotationDemographie"], genre: SETTING_DEFAULTS["booster.rotationGenre"] },
    window: rotation.index,
    hours,
    pin: null,
  });

  // Types : ceux au repos sont cachés comme en prod, pools de tailles variées
  const types = new Map<string, ShopBoosterType>(
    BOOSTER_SEEDS.map((s, i) => {
      const resting = isRotatingFamily(s.family) && !selection[s.family].slugs.includes(s.slug);
      const usesFreeStock = s.usesFreeStock ?? true;
      const priceZeni = s.priceZeni ?? null;
      return [
        s.slug,
        {
          id: s.slug,
          kind: s.kind,
          family: s.family,
          floors: effectiveSlotFloors(s.slotFloors ?? [], globalFloors),
          poolSize: 26 + ((i * 197) % 1400),
          availability: !offered(s) || resting ? "hidden" : !usesFreeStock && priceZeni === null ? "locked" : "open",
          priceZeni,
        },
      ];
    }),
  );

  const seedBySlug = new Map(BOOSTER_SEEDS.map((s) => [s.slug, s]));
  const boosterLine = (slug: string, quantity: number): LotView["lines"] => {
    const seed = seedBySlug.get(slug);
    if (!seed) return [];
    const cards = effectiveSlotFloors(seed.slotFloors ?? [], globalFloors).length;
    return [
      {
        kind: "BOOSTER",
        quantity,
        name: localize(seed.name, locale),
        look: { slug: seed.slug, shape: seed.shape ?? "SACHET", theme: seed.theme, emblem: seed.emblem, contents: contentsLabel(cards) },
      },
    ];
  };
  const packs = shopPackSeeds();
  const lots = new Map<string, LotView>(
    packs.lots.map((lot) => [
      lot.id,
      { id: lot.id, name: localize(lot.name, locale), zeni: lot.zeni, lines: (lot.boosters ?? []).flatMap((b) => boosterLine(b.slug, b.quantity)) },
    ]),
  );
  lots.set("apercu-fuda", { id: "apercu-fuda", name: "Fuda", zeni: 0, lines: [{ kind: "RARITY_CARD", quantity: 1, rarity: "EPIC" }] });
  // Packs standard ×5 et ×10 : le ×10 joue le grand final (feu d'artifice)
  const standardName = localize(seedBySlug.get("standard")?.name ?? { fr: "Standard", en: "" }, locale);
  const standardPacks = [5, 10].map((quantity) => {
    lots.set(`apercu-standard-${quantity}`, { id: `apercu-standard-${quantity}`, name: standardName, zeni: 0, lines: boosterLine("standard", quantity) });
    return {
      id: `apercu-standard-${quantity}`,
      name: `${standardName} ${t("quantity", { count: quantity })}`,
      description: "",
      lotId: `apercu-standard-${quantity}`,
      priceZeni: quantity === 10 ? 1_700 : 900,
      perUserLimit: quantity === 10 ? 3 : null,
      limitPeriod: quantity === 10 ? ("WEEKLY" as const) : null,
      endsAt: null,
    };
  });

  const items = [
    ...standardPacks,
    ...packs.items.map((s) => ({
      id: s.slug,
      name: localize(s.name, locale),
      description: localize(s.description, locale),
      lotId: s.lotId,
      priceZeni: s.priceZeni,
      perUserLimit: s.perUserLimit ?? null,
      limitPeriod: s.limitPeriod ?? null,
      endsAt: null,
    })),
    {
      id: "apercu-fuda",
      name: tRarity("EPIC"),
      description: "",
      lotId: "apercu-fuda",
      priceZeni: 2_500,
      perUserLimit: 1,
      limitPeriod: "DAILY" as const,
      endsAt: new Date(now.getTime() + 2 * 86_400_000),
    },
  ];

  const view = buildShopView<LotView>({
    items,
    lots: new Map([...lots].map(([id, lot]) => [id, shopLotFrom(lot)])),
    types,
    // Hors familles tournantes, toujours affichés : un pack déjà pris deux fois cette semaine, pour
    // voir l'état épuisé, et des crédits Waifus à ouvrir
    bought: new Map([[purchaseKey("pack-5-protagonistes", week.key), 2]]),
    credits: new Map([["waifus", 3]]),
    definitions: BASE_RARITIES.map((key, sortOrder) => ({ key, sortOrder })),
    now,
    timeZone,
    turn: rotation.index,
  });

  const renderBuy = (card: ShopCard<LotView>, place: "hero" | "grid") => {
    const line = card.lot.lines.find((l) => l.kind === "BOOSTER");
    return (
      <PreviewBuy
        celebration={line?.kind === "BOOSTER" ? { look: line.look, name: line.name, quantity: line.quantity } : null}
        price={card.price}
        size={place === "hero" ? "lg" : "md"}
      />
    );
  };

  return (
    <PageShell>
      <ShopStage>
        <ShopNoren />
        <div className="flex flex-col gap-2">
          <SectionTitle level={1} kanji="商店" title={t("preview.title")} subtitle={t("preview.note")} />
        </div>
        <ShopShelves view={view} coins={COINS} now={now} selectionEndsAt={rotation.endsAt} renderBuy={renderBuy} />
      </ShopStage>
    </PageShell>
  );
}
