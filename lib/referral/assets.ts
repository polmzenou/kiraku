// Images du parrainage v2 et de l'Ennichi (étape 18), générées d'après la fiche « Assets à générer » du lot 18-0 et
// intégrées par script (fichiers dans public/images/referral, suffixe de version pour le cache). Clé : identifiant de la
// fiche sans « PV2- », puis ses variantes (thème yoru ou washi, appareil telephone ou ordinateur, couleur…).
// Fichier généré : refaire l'intégration plutôt que de le modifier à la main.

export type ReferralImage = { src: string; width: number; height: number };

export const REFERRAL_IMAGES = {
  "arbre-fond/washi/ordinateur": { src: "/images/referral/arbre-fond-washi-ordinateur-v1.webp", width: 2000, height: 1000 },
  "arbre-fond/washi/telephone": { src: "/images/referral/arbre-fond-washi-telephone-v1.webp", width: 1080, height: 1080 },
  "arbre-fond/yoru/ordinateur": { src: "/images/referral/arbre-fond-yoru-ordinateur-v1.webp", width: 2000, height: 1000 },
  "arbre-fond/yoru/telephone": { src: "/images/referral/arbre-fond-yoru-telephone-v1.webp", width: 1080, height: 1080 },
  "banzuke-papier": { src: "/images/referral/banzuke-papier-v1.webp", width: 1080, height: 1620 },
  "bon/nacre": { src: "/images/referral/bon-nacre-v1.webp", width: 600, height: 400 },
  "bon/or": { src: "/images/referral/bon-or-v1.webp", width: 600, height: 400 },
  "cadre-fil": { src: "/images/referral/cadre-fil-v1.webp", width: 512, height: 512 },
  "discord-annonce": { src: "/images/referral/discord-annonce-v1.jpg", width: 1600, height: 900 },
  "discord-ennichi": { src: "/images/referral/discord-ennichi-v1.jpg", width: 1600, height: 900 },
  "discord-vignette/gris": { src: "/images/referral/discord-vignette-gris-v1.png", width: 256, height: 256 },
  "discord-vignette/jade": { src: "/images/referral/discord-vignette-jade-v1.png", width: 256, height: 256 },
  "discord-vignette/or": { src: "/images/referral/discord-vignette-or-v1.png", width: 256, height: 256 },
  "discord-vignette/vermillon": { src: "/images/referral/discord-vignette-vermillon-v1.png", width: 256, height: 256 },
  "dohyo/ordinateur": { src: "/images/referral/dohyo-ordinateur-v1.webp", width: 1800, height: 480 },
  "dohyo/telephone": { src: "/images/referral/dohyo-telephone-v1.webp", width: 1080, height: 400 },
  "ennichi-rue/washi/ordinateur": { src: "/images/referral/ennichi-rue-washi-ordinateur-v1.webp", width: 2400, height: 700 },
  "ennichi-rue/washi/telephone": { src: "/images/referral/ennichi-rue-washi-telephone-v1.webp", width: 1080, height: 720 },
  "ennichi-rue/yoru/ordinateur": { src: "/images/referral/ennichi-rue-yoru-ordinateur-v1.webp", width: 2400, height: 700 },
  "ennichi-rue/yoru/telephone": { src: "/images/referral/ennichi-rue-yoru-telephone-v1.webp", width: 1080, height: 720 },
  "hanabi": { src: "/images/referral/hanabi-v1.webp", width: 1080, height: 1080 },
  "hanko11": { src: "/images/referral/hanko11-v1.webp", width: 256, height: 256 },
  "hero/washi/ordinateur": { src: "/images/referral/hero-washi-ordinateur-v1.webp", width: 2400, height: 600 },
  "hero/washi/telephone": { src: "/images/referral/hero-washi-telephone-v1.webp", width: 1080, height: 720 },
  "hero/yoru/ordinateur": { src: "/images/referral/hero-yoru-ordinateur-v1.webp", width: 2400, height: 600 },
  "hero/yoru/telephone": { src: "/images/referral/hero-yoru-telephone-v1.webp", width: 1080, height: 720 },
  "kinbyobu/ordinateur": { src: "/images/referral/kinbyobu-ordinateur-v1.webp", width: 1800, height: 900 },
  "kinbyobu/telephone": { src: "/images/referral/kinbyobu-telephone-v1.webp", width: 1080, height: 760 },
  "knot": { src: "/images/referral/knot-v1.webp", width: 512, height: 512 },
  "landing-fond/washi/ordinateur": { src: "/images/referral/landing-fond-washi-ordinateur-v1.webp", width: 2400, height: 1350 },
  "landing-fond/washi/telephone": { src: "/images/referral/landing-fond-washi-telephone-v1.webp", width: 1080, height: 1920 },
  "landing-fond/yoru/ordinateur": { src: "/images/referral/landing-fond-yoru-ordinateur-v1.webp", width: 2400, height: 1350 },
  "landing-fond/yoru/telephone": { src: "/images/referral/landing-fond-yoru-telephone-v1.webp", width: 1080, height: 1920 },
  "lanterne/allumee": { src: "/images/referral/lanterne-allumee-v1.webp", width: 256, height: 360 },
  "lanterne/eteinte": { src: "/images/referral/lanterne-eteinte-v1.webp", width: 256, height: 360 },
  "lettre": { src: "/images/referral/lettre-v1.webp", width: 1080, height: 1350 },
  "mikuji-papier": { src: "/images/referral/mikuji-papier-v1.webp", width: 420, height: 1200 },
  "nobori/indigo": { src: "/images/referral/nobori-indigo-v1.webp", width: 240, height: 1000 },
  "nobori/ivoire": { src: "/images/referral/nobori-ivoire-v1.webp", width: 240, height: 1000 },
  "nobori/vermillon": { src: "/images/referral/nobori-vermillon-v1.webp", width: 240, height: 1000 },
  "og-invit": { src: "/images/referral/og-invit-v1.jpg", width: 1200, height: 630 },
  "plaque-code": { src: "/images/referral/plaque-code-v1.webp", width: 800, height: 220 },
  "pochi/fermee": { src: "/images/referral/pochi-fermee-v1.webp", width: 768, height: 1024 },
  "pochi/ouverte": { src: "/images/referral/pochi-ouverte-v1.webp", width: 768, height: 1024 },
  "sanctuaire/washi/ordinateur": { src: "/images/referral/sanctuaire-washi-ordinateur-v1.webp", width: 2400, height: 1200 },
  "sanctuaire/washi/telephone": { src: "/images/referral/sanctuaire-washi-telephone-v1.webp", width: 1080, height: 1080 },
  "sanctuaire/yoru/ordinateur": { src: "/images/referral/sanctuaire-yoru-ordinateur-v1.webp", width: 2400, height: 1200 },
  "sanctuaire/yoru/telephone": { src: "/images/referral/sanctuaire-yoru-telephone-v1.webp", width: 1080, height: 1080 },
  "spr-or": { src: "/images/referral/spr-or-v1.webp", width: 1024, height: 128 },
  "thread": { src: "/images/referral/thread-v1.webp", width: 1024, height: 48 },
  "tsuna": { src: "/images/referral/tsuna-v1.webp", width: 512, height: 160 },
} as const satisfies Record<string, ReferralImage>;

export type ReferralImageKey = keyof typeof REFERRAL_IMAGES;

/** Image d'un thème : la version Washi en thème clair, sinon Yoru. */
export function themedImage(base: string, theme: "yoru" | "washi", device?: "telephone" | "ordinateur"): ReferralImage | null {
  const key = [base, theme, ...(device ? [device] : [])].join("/");
  return (REFERRAL_IMAGES as Record<string, ReferralImage>)[key] ?? null;
}
