import Image from "next/image";
import { REFERRAL_IMAGES } from "@/lib/referral/assets";
import type { VoucherKindKey } from "@/lib/referral/vouchers";

/**
 * Billet d'un bon (PV2-BON) : nacre pour « Mythique au choix » avec le sceau 選, feuille d'or pour la carte 1/1. La
 * marque est posée dans le carré vermillon du billet. Décoratif : le texte voisin dit de quel bon il s'agit.
 */
export function VoucherTicket({ kind, width = 40, className = "" }: { kind: VoucherKindKey; width?: number; className?: string }) {
  const one = kind === "ONE_OF_ONE";
  const img = one ? REFERRAL_IMAGES["bon/or"] : REFERRAL_IMAGES["bon/nacre"];
  const height = Math.round((width * img.height) / img.width);
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 items-center justify-center drop-shadow-[0_2px_2px_rgb(0_0_0/0.3)] ${className}`}
      style={{ width, height }}
    >
      <Image src={img.src} alt="" width={width} height={height} className="absolute inset-0 size-full object-contain" />
      {one ? (
        <b className="relative font-title font-extrabold tracking-tight text-[#9e2a1f] tabular-nums" style={{ fontSize: Math.max(8, width * 0.2) }}>
          1/1
        </b>
      ) : (
        <b lang="ja" className="relative font-seal font-normal text-[#c8372d]" style={{ fontSize: Math.max(9, width * 0.34) }}>
          選
        </b>
      )}
    </span>
  );
}
