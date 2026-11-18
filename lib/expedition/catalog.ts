import type { ExpeditionRisk } from "./types";

// Catalogue d'expéditions par défaut, installé depuis /admin/expeditions (« Installer le catalogue
// par défaut »), par slug : un modèle déjà présent n'est jamais modifié. Toutes les valeurs restent
// réglables ensuite. Six paliers (Épique → XR), trois profils de risque chacun : plus le palier monte,
// plus c'est long, risqué et rémunérateur. Gains en Zeni et boosters « Tout anime ».

export type DefaultExpedition = {
  slug: string;
  name: { fr: string; en: string };
  lore: { fr: string; en: string };
  minRarity: string;
  risk: ExpeditionRisk;
  durationMinutes: number;
  baseSuccessPct: number;
  maxSuccessPct: number;
  maxTriumphPct: number;
  minDiscoveryPct: number;
  zeni: number;
  boosters: number;
  /** Lot bonus créé avec le modèle : cartes tirées dans une rareté. */
  extra: { rarity: string; quantity: number; name: { fr: string; en: string } } | null;
  weight: number;
  sortOrder: number;
};

/** Slug du booster versé par défaut (« Tout anime »). */
export const DEFAULT_EXPEDITION_BOOSTER_SLUG = "standard";

const H = 60;

type Row = [
  slug: string,
  name: [fr: string, en: string],
  lore: [fr: string, en: string],
  hours: number,
  base: number,
  max: number,
  zeni: number,
  boosters: number,
  discovery: number,
];

const TRIUMPH_CAP: Record<ExpeditionRisk, number> = { SAFE: 25, BALANCED: 15, RISKY: 10 };
const RISKS: readonly ExpeditionRisk[] = ["SAFE", "BALANCED", "RISKY"];

// Poids au tirage : les paliers accessibles reviennent plus souvent que les plus rares
const TIERS: { rarity: string; weight: number; rows: [Row, Row, Row]; extra?: DefaultExpedition["extra"] }[] = [
  {
    rarity: "EPIC",
    weight: 14,
    rows: [
      ["sentier-des-lucioles", ["Sentier des lucioles", "Firefly Trail"], ["Une balade du soir entre les rizières, sans danger.", "An evening stroll through the rice fields, perfectly safe."], 1, 100, 100, 150, 1, 0],
      ["bambouseraie-des-murmures", ["Bambouseraie des murmures", "Whispering Bamboo Grove"], ["Les tiges chuchotent des chemins qui changent à chaque pas.", "The stalks whisper paths that shift with every step."], 2, 60, 95, 400, 2, 0],
      ["gorges-de-l-oni-rouge", ["Gorges de l'Oni rouge", "Red Oni Gorge"], ["Un oni garde le pont de cordes. Il n'aime pas les visiteurs.", "An oni guards the rope bridge. It dislikes visitors."], 4, 35, 90, 800, 4, 0],
    ],
  },
  {
    rarity: "LEGENDARY",
    weight: 13,
    rows: [
      ["relais-du-the-vert", ["Relais du thé vert", "Green Tea Relay"], ["Porter des feuilles de thé au relais voisin, avant midi.", "Carry tea leaves to the next relay station before noon."], 2, 100, 100, 250, 2, 0],
      ["col-des-brumes", ["Col des brumes", "Misty Pass"], ["Le brouillard efface le sentier ; seuls les plus sûrs passent.", "The fog erases the trail; only the surest make it through."], 4, 55, 95, 650, 3, 0],
      ["temple-englouti", ["Temple englouti", "Sunken Temple"], ["À marée basse, un sanctuaire oublié refait surface.", "At low tide, a forgotten shrine rises from the sea."], 6, 30, 90, 1300, 6, 2],
    ],
  },
  {
    rarity: "MYTHIC",
    weight: 12,
    rows: [
      ["jardin-de-pierre", ["Jardin de pierre", "Stone Garden"], ["Ratisser le sable d'un jardin zen, sous l'œil d'un moine.", "Rake the sand of a zen garden under a monk's watchful eye."], 3, 100, 100, 400, 3, 0],
      ["sanctuaire-des-renards", ["Sanctuaire des renards", "Fox Shrine"], ["Mille torii rouges, et les kitsune qui s'amusent à égarer.", "A thousand red torii, and kitsune who love to lead astray."], 6, 50, 92, 1000, 5, 0],
      ["foret-sans-retour", ["Forêt sans retour", "Forest of No Return"], ["Les arbres se ressemblent tous. Personne n'en revient pareil.", "Every tree looks the same. No one comes back unchanged."], 9, 28, 88, 2000, 8, 4],
    ],
  },
  {
    rarity: "AR",
    weight: 10,
    rows: [
      ["port-des-lanternes", ["Port des lanternes", "Lantern Harbor"], ["Allumer les lanternes du port avant le retour des pêcheurs.", "Light the harbor lanterns before the fishermen return."], 4, 100, 100, 550, 4, 0],
      ["ile-des-tengu", ["Île des tengu", "Tengu Isle"], ["Les tengu défient quiconque pose le pied sur leur île.", "The tengu challenge anyone who sets foot on their isle."], 8, 45, 90, 1400, 7, 0],
      ["marais-des-yokai", ["Marais des yōkai", "Yōkai Marsh"], ["Des feux follets dansent au-dessus de l'eau noire.", "Will-o'-the-wisps dance above the black water."], 12, 25, 85, 2800, 10, 6],
    ],
  },
  {
    rarity: "GOLD",
    weight: 8,
    rows: [
      ["riviere-d-or", ["Rivière d'or", "Golden River"], ["Tamiser les paillettes d'une rivière bénie.", "Pan for flakes in a blessed river."], 6, 100, 100, 700, 5, 0],
      ["citadelle-des-nuages", ["Citadelle des nuages", "Cloud Citadel"], ["Une forteresse flotte au-dessus des sommets. Son seigneur attend.", "A fortress floats above the peaks. Its lord is waiting."], 12, 40, 88, 1800, 10, 0],
      ["volcan-du-dragon", ["Volcan du dragon", "Dragon's Volcano"], ["Un dragon dort sous la lave. Il garde un trésor.", "A dragon sleeps beneath the lava, guarding a treasure."], 18, 22, 82, 3800, 14, 8],
    ],
    extra: { rarity: "LEGENDARY", quantity: 1, name: { fr: "Expédition : carte Légendaire", en: "Expedition: Legendary card" } },
  },
  {
    rarity: "XR",
    weight: 6,
    rows: [
      ["pagode-de-cristal", ["Pagode de cristal", "Crystal Pagoda"], ["Veiller sur une pagode qui chante quand le vent passe.", "Keep watch over a pagoda that sings in the wind."], 8, 100, 100, 1000, 6, 0],
      ["mer-de-nuages-eternelle", ["Mer de nuages éternelle", "Endless Sea of Clouds"], ["Naviguer au-dessus des nuages, là où le ciel n'a pas de fond.", "Sail above the clouds, where the sky has no floor."], 16, 40, 85, 2500, 12, 0],
      ["cime-du-ciel", ["Cime du ciel", "Sky's Summit"], ["Le plus haut sommet du monde. Seules les légendes l'ont vu.", "The highest peak in the world. Only legends have seen it."], 24, 20, 80, 5000, 20, 10],
    ],
    extra: { rarity: "MYTHIC", quantity: 1, name: { fr: "Expédition : carte Mythique", en: "Expedition: Mythic card" } },
  },
];

export const DEFAULT_EXPEDITIONS: readonly DefaultExpedition[] = TIERS.flatMap((tier, t) =>
  tier.rows.map(([slug, [nameFr, nameEn], [loreFr, loreEn], hours, base, max, zeni, boosters, discovery], i) => ({
    slug,
    name: { fr: nameFr, en: nameEn },
    lore: { fr: loreFr, en: loreEn },
    minRarity: tier.rarity,
    risk: RISKS[i],
    durationMinutes: hours * H,
    baseSuccessPct: base,
    maxSuccessPct: max,
    maxTriumphPct: TRIUMPH_CAP[RISKS[i]],
    minDiscoveryPct: discovery,
    zeni,
    boosters,
    // Lot bonus : seulement sur l'expédition périlleuse des deux paliers les plus hauts
    extra: RISKS[i] === "RISKY" ? (tier.extra ?? null) : null,
    weight: tier.weight,
    sortOrder: t * 10 + i,
  })),
);
