import { useTranslations } from "next-intl";
import { PageShell } from "@/components/PageShell";

// Squelette aux couleurs Yoru pendant le chargement de la grille
export default function WikiLoading() {
  const t = useTranslations("wiki");
  return (
    <PageShell>
      <p role="status" className="sr-only">
        {t("loading")}
      </p>
      <div className="flex flex-col gap-2" aria-hidden="true">
        <div className="h-9 w-32 rounded-button bg-surface" />
        <div className="h-4 w-40 rounded-button bg-surface" />
      </div>
      <div className="h-11 rounded-button bg-surface" aria-hidden="true" />
      <ul className="grid grid-cols-3 gap-2 md:grid-cols-4 md:gap-3 lg:grid-cols-6 xl:grid-cols-8" aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => (
          <li key={i} className="aspect-[5/7] animate-pulse rounded-[5px] bg-surface" />
        ))}
      </ul>
    </PageShell>
  );
}
