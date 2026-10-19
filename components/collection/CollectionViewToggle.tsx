import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { segmentedItemClass, segmentedTrackClass } from "../ui/Segmented";

/** Bascule « Cartes | Albums » de la collection : deux liens, l'état reste dans l'URL. */
export function CollectionViewToggle({ view }: { view: "cards" | "albums" }) {
  const t = useTranslations("collection.views");
  return (
    <nav aria-label={t("label")} className={segmentedTrackClass}>
      <Link href="/collection" aria-current={view === "cards" ? "page" : undefined} className={segmentedItemClass}>
        {t("cards")}
      </Link>
      <Link
        href={{ pathname: "/collection", query: { vue: "albums" } }}
        aria-current={view === "albums" ? "page" : undefined}
        className={segmentedItemClass}
      >
        {t("albums")}
      </Link>
    </nav>
  );
}
