import type { PoolFilter } from "../../lib/boosters/pool-filter.ts";
import type { BoosterFamily, BoosterKind, BoosterShape, BoosterTheme, Localized } from "../../lib/boosters/types.ts";
import type { Rarity } from "../../lib/catalog/rarity.ts";
import { ANTAGONIST_ANILIST_IDS } from "./antagonists.ts";

// Les boosters en 8 familles (planche « Choix du booster »). Valeurs de départ seulement :
// une fois en base, tout se règle dans /admin/boosters/types (le seed ne réécrase qu'avec --force).

export type BoosterSeed = {
  slug: string;
  kind: BoosterKind;
  family: BoosterFamily;
  name: Localized;
  tagline: Localized;
  emblem: string;
  shape?: BoosterShape;
  theme: BoosterTheme;
  filter?: PoolFilter;
  /** Absent = réglage global booster.slotFloors (C · C · U+ · R+). */
  slotFloors?: Rarity[];
  usesFreeStock?: boolean;
  priceZeni?: number | null;
  countsForPity?: boolean;
  /** Ses Mythiques remettent la pitié à zéro (par défaut oui ; non pour l'Impérial). */
  resetsPity?: boolean;
  bonusEligible?: boolean;
  /** Boost de rareté en points de base (27 000 = ×2,7), à partir de rateBoostFrom. */
  rateBoost?: number;
  rateBoostFrom?: Rarity;
  minPoolSize?: number;
  active?: boolean;
};

/** Prix d'un sachet gratuit quand le stock est vide (comme Kyara). */
const EMPTY_STOCK_PRICE = 200;

const theme = (base: string, dark: string, pattern: BoosterTheme["pattern"], ink: BoosterTheme["ink"] = "light") => ({
  base,
  dark,
  pattern,
  ink,
});

const free = { usesFreeStock: true, priceZeni: EMPTY_STOCK_PRICE } as const;
const paid = (priceZeni: number | null) => ({ usesFreeStock: false, priceZeni, countsForPity: false, bonusEligible: false });

const filtered = (
  family: BoosterFamily,
  slug: string,
  emblem: string,
  name: [string, string],
  tagline: [string, string],
  t: BoosterTheme,
  filter: PoolFilter,
  extra: Partial<BoosterSeed> = {},
): BoosterSeed => ({
  slug,
  kind: "FILTERED",
  family,
  emblem,
  name: { fr: name[0], en: name[1] },
  tagline: { fr: tagline[0], en: tagline[1] },
  theme: t,
  filter,
  ...free,
  ...extra,
});

const C: Rarity = "COMMON";
const U: Rarity = "UNCOMMON";
const R: Rarity = "RARE";
const E: Rarity = "EPIC";

export const BOOSTER_SEEDS: BoosterSeed[] = [
  // 定番 Standard
  {
    slug: "standard",
    kind: "STANDARD",
    family: "standard",
    emblem: "福",
    name: { fr: "Tout anime", en: "All anime" },
    tagline: { fr: "Tous les persos", en: "Every character" },
    theme: theme("#C8372D", "#5E1712", "asanoha"),
    ...free,
  },

  // 形 Formats, payés en Zeni, comptent pour la pitié
  {
    slug: "pochibukuro",
    kind: "FORMAT",
    family: "formats",
    emblem: "小",
    shape: "POCHIBUKURO",
    name: { fr: "Pochibukuro", en: "Pochibukuro" },
    tagline: { fr: "Mini-sachet, 2 cartes", en: "Mini envelope, 2 cards" },
    theme: theme("#B23A2A", "#6E1C14", "kin"),
    slotFloors: [C, U],
    ...paid(100),
    countsForPity: true,
  },
  {
    slug: "jubako",
    kind: "FORMAT",
    family: "formats",
    emblem: "重",
    shape: "JUBAKO",
    name: { fr: "Jūbako", en: "Jūbako" },
    tagline: { fr: "20 cartes, Épique garantie", en: "20 cards, Epic guaranteed" },
    theme: theme("#2A1F1F", "#0E0A0A", "none"),
    // 5 sachets standard, la Rare+ du dernier remplacée par une Épique+
    slotFloors: [C, C, U, R, C, C, U, R, C, C, U, R, C, C, U, R, C, C, U, E],
    ...paid(550),
    countsForPity: true,
  },

  // 稀少 Par rareté, planchers relevés, ni pitié, ni doré, ni divin
  {
    slug: "rare",
    kind: "RARITY",
    family: "rarete",
    emblem: "稀",
    name: { fr: "Rare", en: "Rare" },
    tagline: { fr: "4 Rares ou mieux", en: "4 Rares or better" },
    theme: theme("#2C5A86", "#0F2238", "seigaiha"),
    slotFloors: [R, R, R, R],
    ...paid(300),
  },
  {
    slug: "epique",
    kind: "RARITY",
    family: "rarete",
    emblem: "秀",
    name: { fr: "Épique", en: "Epic" },
    tagline: { fr: "2 Épiques garanties", en: "2 Epics guaranteed" },
    theme: theme("#6E4796", "#21123A", "shippo"),
    slotFloors: [R, R, E, E],
    ...paid(1200),
  },
  {
    slug: "legendaire",
    kind: "RARITY",
    family: "rarete",
    emblem: "金",
    name: { fr: "Légendaire", en: "Legendary" },
    tagline: { fr: "1 Légendaire garantie", en: "1 Legendary guaranteed" },
    theme: theme("#C9A23A", "#5C420D", "kin"),
    slotFloors: [E, E, E, "LEGENDARY"],
    ...paid(5000),
  },
  {
    slug: "mythique",
    kind: "RARITY",
    family: "rarete",
    emblem: "神",
    name: { fr: "Mythique", en: "Mythic" },
    tagline: { fr: "1 Mythique garantie", en: "1 Mythic guaranteed" },
    theme: theme("#EDE6F2", "#B9A7CF", "raden", "dark"),
    slotFloors: [E, E, E, "MYTHIC"],
    // Offert pendant les événements et en fin de saison : pas d'achat
    ...paid(null),
  },

  // 読者 Par démographie (tag de l'œuvre, rang ≥ 60)
  filtered("demographie", "shonen", "少", ["Shōnen", "Shōnen"], ["Œuvres shōnen", "Shōnen series"], theme("#E0702E", "#6E2A08", "yagasuri"), { tags: ["Shounen"] }),
  filtered("demographie", "seinen", "青", ["Seinen", "Seinen"], ["Œuvres seinen", "Seinen series"], theme("#56626E", "#1B2026", "ichimatsu"), { tags: ["Seinen"] }),
  filtered("demographie", "shojo", "花", ["Shōjo", "Shōjo"], ["Œuvres shōjo", "Shōjo series"], theme("#F0B3C2", "#C46F86", "sakura", "dark"), { tags: ["Shoujo"] }),
  filtered("demographie", "josei", "麗", ["Josei", "Josei"], ["Œuvres josei", "Josei series"], theme("#9A5470", "#3A1525", "shippo"), { tags: ["Josei"] }),

  // 類 Par genre (genre AniList de l'œuvre ; Isekai est un tag)
  filtered("genre", "isekai", "異", ["Isekai", "Isekai"], ["Un autre monde", "Another world"], theme("#33908A", "#0F3B38", "kumo"), { tags: ["Isekai"] }),
  filtered("genre", "sport", "球", ["Sport", "Sports"], ["Terrains et compétitions", "Fields and tournaments"], theme("#469142", "#163514", "ichimatsu"), { genres: ["Sports"] }),
  filtered("genre", "mecha", "機", ["Mecha", "Mecha"], ["Robots géants", "Giant robots"], theme("#5A6068", "#1A1C20", "asanoha"), { genres: ["Mecha"] }),
  filtered("genre", "horreur", "怖", ["Horreur", "Horror"], ["Frissons garantis", "Chills guaranteed"], theme("#7A2020", "#1E0606", "uroko"), { genres: ["Horror"] }),
  filtered("genre", "romance", "恋", ["Romance", "Romance"], ["Histoires de cœur", "Matters of the heart"], theme("#D4627A", "#5E1C2C", "sakura"), { genres: ["Romance"] }),
  filtered("genre", "fantasy", "魔", ["Fantasy", "Fantasy"], ["Magie et royaumes", "Magic and kingdoms"], theme("#4A48A0", "#15143A", "kumo"), { genres: ["Fantasy"] }),
  filtered("genre", "science-fiction", "宙", ["Science-fiction", "Sci-fi"], ["Espace et futur", "Space and the future"], theme("#2A4A78", "#08111F", "asanoha"), { genres: ["Sci-Fi"] }),
  filtered("genre", "tranche-de-vie", "日", ["Tranche de vie", "Slice of life"], ["Le quotidien", "Everyday life"], theme("#D9A43C", "#6E4B0E", "seigaiha"), { genres: ["Slice of Life"] }),
  filtered("genre", "comedie", "笑", ["Comédie", "Comedy"], ["Pour rire", "For laughs"], theme("#F0CE5A", "#B8902F", "shippo", "dark"), { genres: ["Comedy"] }),
  filtered("genre", "psychologique", "心", ["Psychologique", "Psychological"], ["Esprits tordus", "Twisted minds"], theme("#5E3666", "#1C0C20", "uroko"), { genres: ["Psychological"] }),
  filtered("genre", "musique", "音", ["Musique", "Music"], ["Scènes et idoles", "Stages and idols"], theme("#B8467F", "#4A1230", "seigaiha"), { genres: ["Music"] }),

  // 人物 Par personnage
  filtered("personnage", "waifus", "姫", ["Waifus", "Waifus"], ["Personnages féminins", "Female characters"], theme("#F2C2D0", "#C77892", "sakura", "dark"), { gender: "Female" }),
  filtered("personnage", "husbandos", "侍", ["Husbandos", "Husbandos"], ["Personnages masculins", "Male characters"], theme("#2E4470", "#0A1222", "yagasuri"), { gender: "Male" }),
  filtered("personnage", "protagonistes", "主", ["Protagonistes", "Protagonists"], ["Rôles principaux", "Main roles"], theme("#C4452F", "#4A120A", "uroko"), { role: "MAIN" }),
  filtered("personnage", "antagonistes", "悪", ["Antagonistes", "Antagonists"], ["Les visages de l'opposition", "The faces of opposition"], theme("#713E80", "#200E2B", "uroko"), { anilistIds: ANTAGONIST_ANILIST_IDS }, { minPoolSize: 10 }),
  filtered("personnage", "seconds-roles", "脇", ["Seconds rôles", "Supporting cast"], ["Ceux qu'on oublie", "The unsung ones"], theme("#7A8676", "#2A3028", "ichimatsu"), { role: "SUPPORTING" }),
  filtered("personnage", "anniversaires", "祝", ["Anniversaires", "Birthdays"], ["Nés aujourd'hui", "Born today"], theme("#C8372D", "#5E1712", "kin"), { birthdayToday: true }, { minPoolSize: 20 }),

  // 時代 Par époque (année de l'œuvre principale)
  filtered("epoque", "retro", "昔", ["Rétro", "Retro"], ["Avant 2000", "Before 2000"], theme("#8A5E3A", "#2E1A0C", "seigaiha"), { yearMax: 1999 }),
  filtered("epoque", "annees-2000", "千", ["Années 2000", "The 2000s"], ["2000 – 2009", "2000 – 2009"], theme("#6A8AA6", "#22303D", "ichimatsu"), { yearMin: 2000, yearMax: 2009 }),
  filtered("epoque", "nouvelle-vague", "新", ["Nouvelle vague", "New wave"], ["Depuis 2018", "Since 2018"], theme("#34A07F", "#0E3A2D", "asanoha"), { yearMin: 2018 }),
  filtered("epoque", "saison", "季", ["Saison en cours", "This season"], ["Diffusés en ce moment", "Airing right now"], theme("#C25668", "#4A1620", "sakura"), { currentSeason: true }),

  // 特別 Spéciaux, réglés dans l'admin (bannière et studio inactifs tant qu'ils ne sont pas choisis)
  {
    slug: "banniere",
    kind: "BANNER",
    family: "special",
    emblem: "星",
    name: { fr: "Bannière vedette", en: "Featured banner" },
    tagline: { fr: "Œuvre ou perso à l'honneur", en: "A series or character in the spotlight" },
    theme: theme("#24386A", "#080E20", "kin"),
    ...free,
    active: false,
  },
  filtered("special", "studio", "匠", ["Studio", "Studio"], ["Un studio à l'honneur", "A studio in the spotlight"], theme("#46413D", "#141210", "shippo"), {}, { active: false }),
  filtered("special", "manga", "紙", ["Manga", "Manga"], ["Persos jamais animés", "Never-animated characters"], theme("#DCD0B4", "#9A8A68", "asanoha", "dark"), { mediaType: "MANGA" }),

  // Exclusif boutique (3 500 Zeni, 1 par jour) : 5 cartes comme le standard, Légendaire et mieux ×2,7.
  // Laque noire et filets d'or kikkō ; compte pour la pitié et le sachet doré, jamais scellé. Ses Mythiques
  // ne remettent pas la pitié à zéro : seule la Mythique garantie le fait.
  {
    slug: "imperial",
    kind: "PRESTIGE",
    family: "special",
    emblem: "皇",
    name: { fr: "Impérial", en: "Imperial" },
    tagline: { fr: "Légendaire et mieux ×2,7", en: "Legendary and up ×2.7" },
    theme: theme("#2A2016", "#0A0806", "kikko"),
    filter: {},
    usesFreeStock: false,
    priceZeni: null,
    countsForPity: true,
    resetsPity: false,
    bonusEligible: true,
    rateBoost: 27_000,
    rateBoostFrom: "LEGENDARY",
  },

  // Sachets scellés : tombent d'un booster gratuit, jamais proposés ni vendus (planchers dans le tirage)
  {
    slug: "divin",
    kind: "DROP",
    family: "special",
    emblem: "天",
    name: { fr: "Booster divin", en: "Divine booster" },
    tagline: { fr: "Épique ou mieux, une Mythique garantie", en: "Epic or better, one Mythic guaranteed" },
    // Ivoire et rayons d'or (後光), comme dans l'annonce de la v2 : pas la nacre lilas du Mythique
    theme: theme("#FBF5E4", "#B58A2C", "goko", "dark"),
    filter: {},
    ...paid(null),
  },
  {
    slug: "apocalypse",
    kind: "DROP",
    family: "special",
    emblem: "滅",
    name: { fr: "Booster apocalyptique", en: "Apocalyptic booster" },
    tagline: { fr: "Divin… ou ruiné", en: "Divine… or ruined" },
    theme: theme("#4A0F0B", "#0E0505", "kumo"),
    filter: {},
    ...paid(null),
  },
];
