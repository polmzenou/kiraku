import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { SHOWCASE_THEMES, type ShowcaseThemeId } from "@/lib/showcase/theme-registry";
import "./showcase.css";

export type ShowcaseTab = { id: string; name: string; theme: ShowcaseThemeId };

/** Onglets des vitrines d'un joueur, suspendus à une baguette ; l'onglet courant prend le ton de son thème. */
export function ShowcaseTabs({
  username,
  ownerName,
  tabs,
  currentId,
  extra,
}: {
  username: string;
  ownerName: string;
  tabs: readonly ShowcaseTab[];
  currentId: string;
  /** Après les onglets (bouton « Nouvelle vitrine » du propriétaire). */
  extra?: ReactNode;
}) {
  const t = useTranslations("showcase");
  return (
    <nav aria-label={t("tabsLabel", { name: ownerName })} className="vt-tabs -mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
      <div className="flex items-start gap-1.5">
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={`/u/${username}/vitrines/${tab.id}`}
            prefetch={false}
            scroll={false}
            aria-current={tab.id === currentId ? "page" : undefined}
            data-vt-tone={tab.theme}
            className="vt-tab"
          >
            <span aria-hidden="true" className="vt-tab-kanji">
              {SHOWCASE_THEMES[tab.theme].kanji}
            </span>
            {tab.name}
          </Link>
        ))}
        {extra}
      </div>
    </nav>
  );
}
