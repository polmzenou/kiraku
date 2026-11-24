import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export type ReferralAdminTab = "queue" | "tracking" | "codes" | "settings" | "legacy";

const TABS: { key: ReferralAdminTab; href: string }[] = [
  { key: "queue", href: "/admin/parrainage" },
  { key: "tracking", href: "/admin/parrainage/suivi" },
  { key: "codes", href: "/admin/parrainage/codes" },
  { key: "settings", href: "/admin/parrainage/reglages" },
  { key: "legacy", href: "/admin/parrainage/ancien" },
];

/** Onglets de l'admin du parrainage : file « À vérifier » (avec son nombre), suivi, codes perso, réglages, ancien parrainage (v1). */
export async function ReferralAdminTabs({ active, held }: { active: ReferralAdminTab; held: number }) {
  const t = await getTranslations("admin.referralV2.tabs");
  return (
    <nav aria-label={t("label")} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === active ? "page" : undefined}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-pill border border-border bg-surface px-4 text-sm font-bold text-text-muted aria-[current=page]:border-shu aria-[current=page]:bg-shu/15 aria-[current=page]:text-text"
        >
          {t(tab.key)}
          {tab.key === "queue" && held > 0 && <b className="rounded-pill bg-shu-btn px-2 text-xs tabular-nums text-washi-paper">{held}</b>}
        </Link>
      ))}
    </nav>
  );
}
