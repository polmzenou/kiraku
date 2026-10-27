import { useTranslations } from "next-intl";
import { FAMILY_KANJI } from "@/lib/boosters/types";
import type { ShopSectionKey } from "@/lib/economy/shop-view";
import { chipClasses } from "../ui/Chip";

/** Kanji de section : famille du booster, ou 札 (fuda) pour les cartes et extras. */
export function sectionKanji(key: ShopSectionKey) {
  return key === "other" ? "札" : FAMILY_KANJI[key];
}

/** Accès direct aux familles : pilules qui défilent à l'horizontale (sans déclencher le swipe d'onglet). */
export function ShopFamilyNav({ sections }: { sections: readonly ShopSectionKey[] }) {
  const t = useTranslations("economy.shop");
  const tb = useTranslations("boosters.families");
  return (
    <nav aria-label={t("nav")} data-swipe-ignore className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
      <ul className="flex w-max gap-2 pb-1">
        {sections.map((key) => (
          <li key={key}>
            <a href={`#famille-${key}`} className={chipClasses(false)}>
              <span aria-hidden="true" lang="ja" className="font-seal text-base text-shu">
                {sectionKanji(key)}
              </span>
              {key === "other" ? t("other.title") : tb(`${key}.short`)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
