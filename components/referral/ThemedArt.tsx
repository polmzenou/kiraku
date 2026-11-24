import Image from "next/image";
import { REFERRAL_IMAGES, type ReferralImage } from "@/lib/referral/assets";

const pick = (key: string): ReferralImage | null => (REFERRAL_IMAGES as Record<string, ReferralImage>)[key] ?? null;

/**
 * Décor du parrainage v2 dans son conteneur (relatif) : la version Yoru ou Washi, téléphone ou ordinateur, basculée en
 * CSS (variante washi:, point de rupture md) ; rien n'est choisi en JavaScript, donc pas de saut au chargement.
 */
export function ThemedArt({ base, sizes, priority = false, className = "" }: { base: string; sizes: string; priority?: boolean; className?: string }) {
  const variants = [
    { key: `${base}/yoru/telephone`, cls: "washi:hidden md:hidden" },
    { key: `${base}/yoru/ordinateur`, cls: "hidden md:block washi:md:hidden" },
    { key: `${base}/washi/telephone`, cls: "hidden washi:block washi:md:hidden" },
    { key: `${base}/washi/ordinateur`, cls: "hidden washi:md:block" },
  ];
  return (
    <>
      {variants.map(({ key, cls }) => {
        const img = pick(key);
        return img ? <Image key={key} src={img.src} alt="" fill sizes={sizes} priority={priority} className={`object-cover ${cls} ${className}`} /> : null;
      })}
    </>
  );
}

/** Objet du parrainage (lanterne, nœud, sceau…), une seule version. */
export function ReferralObject({ id, alt = "", className = "", sizes = "96px" }: { id: string; alt?: string; className?: string; sizes?: string }) {
  const img = pick(id);
  if (!img) return null;
  return <Image src={img.src} alt={alt} width={img.width} height={img.height} sizes={sizes} className={className} />;
}
