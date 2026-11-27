import Image, { getImageProps } from "next/image";
import { cookies } from "next/headers";
import { REFERRAL_IMAGES, type ReferralImage } from "@/lib/referral/assets";
import { parseTheme, THEME_COOKIE, type Theme } from "@/lib/theme";

const pick = (key: string): ReferralImage | null => (REFERRAL_IMAGES as Record<string, ReferralImage>)[key] ?? null;

/** Point de rupture md de Tailwind : au-delà, la version ordinateur. */
const DESKTOP = "(min-width: 48rem)";
/** Une image par thème ; celle de l'autre thème reste cachée en CSS (variante washi:). */
const SHOWN: Record<Theme, string> = { yoru: "washi:hidden", washi: "hidden washi:inline" };

/**
 * Décor d'un thème : une seule image, la version téléphone ou ordinateur choisie par le navigateur (<picture>). `eager` :
 * chargée tout de suite et en priorité (image principale) ; sinon à l'approche, donc jamais quand elle est cachée.
 */
function ThemePicture({ base, theme, sizes, eager, className }: { base: string; theme: Theme; sizes: string; eager: boolean; className: string }) {
  const phone = pick(`${base}/${theme}/telephone`);
  const desk = pick(`${base}/${theme}/ordinateur`);
  const main = phone ?? desk;
  if (!main) return null;
  const common = { alt: "", fill: true, sizes, ...(eager ? { loading: "eager" as const, fetchPriority: "high" as const } : {}) };
  const img = getImageProps({ ...common, src: main.src }).props;
  const deskSet = phone && desk ? getImageProps({ ...common, src: desk.src }).props.srcSet : undefined;
  return (
    <picture className={SHOWN[theme]}>
      {deskSet && <source media={DESKTOP} srcSet={deskSet} sizes={sizes} />}
      {/* Props de next/image (getImageProps) : formats et tailles optimisés, <picture> choisit l'appareil */}
      <img {...img} alt="" className={`object-cover ${className}`} />
    </picture>
  );
}

/**
 * Décor du parrainage v2 dans son conteneur (relatif) : la version Yoru ou Washi, téléphone ou ordinateur. Le thème
 * bascule en CSS (variante washi:), l'appareil par <picture> : rien n'est choisi en JavaScript, donc pas de saut au
 * chargement, et le navigateur ne télécharge que l'image affichée. `priority` : celle du thème du joueur (cookie) part
 * en premier ; l'autre ne se charge que s'il change de thème sur la page.
 */
export async function ThemedArt({ base, sizes, priority = false, className = "" }: { base: string; sizes: string; priority?: boolean; className?: string }) {
  const current = priority ? parseTheme((await cookies()).get(THEME_COOKIE)?.value) : null;
  return (
    <>
      {(["yoru", "washi"] as const).map((theme) => (
        <ThemePicture key={theme} base={base} theme={theme} sizes={sizes} eager={theme === current} className={className} />
      ))}
    </>
  );
}

/** Objet du parrainage (lanterne, nœud, sceau…), une seule version. */
export function ReferralObject({ id, alt = "", className = "", sizes = "96px" }: { id: string; alt?: string; className?: string; sizes?: string }) {
  const img = pick(id);
  if (!img) return null;
  return <Image src={img.src} alt={alt} width={img.width} height={img.height} sizes={sizes} className={className} />;
}
