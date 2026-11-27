import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { segmentedItemClass, segmentedTrackClass } from "../ui/Segmented";

export type NewsTab = "cards" | "frescoes";

/** Onglets de la page Nouveautés : « Nouvelles cartes · Nouvelles fresques » (la seconde après la première sortie). */
export function NewsTabs({ current }: { current: NewsTab }) {
  const t = useTranslations("fresco.news");
  const tabs: { id: NewsTab; href: string; label: string }[] = [
    { id: "cards", href: "/wiki/nouveautes", label: t("cardsTab") },
    { id: "frescoes", href: "/wiki/nouveautes?onglet=fresques", label: t("frescoesTab") },
  ];
  return (
    <nav aria-label={t("tabsLabel")} className={`${segmentedTrackClass} self-start`}>
      {tabs.map((tab) => (
        <Link key={tab.id} href={tab.href} prefetch={false} aria-current={current === tab.id ? "page" : undefined} className={`${segmentedItemClass} min-h-11 md:px-5`}>
          {tab.id === "frescoes" && (
            <span aria-hidden="true" lang="ja" className="font-seal">
              絵
            </span>
          )}
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
