import { useTranslations } from "next-intl";
import { PageShell } from "./PageShell";

const block = "rounded-card bg-surface animate-pulse motion-reduce:animate-none";

/**
 * Squelette aux couleurs Yoru pendant le chargement d'une page (loading.tsx) : titre, puis une
 * grille de fuda, une liste ou les sections du Compte. Seules les formes s'animent (opacité).
 */
export function PageSkeleton({ variant }: { variant: "grid" | "list" | "account" }) {
  const t = useTranslations("common");
  return (
    <PageShell>
      <p role="status" className="sr-only">
        {t("loading")}
      </p>
      <div className="flex flex-col gap-2" aria-hidden="true">
        <div className={`h-9 w-44 ${block}`} />
        <div className={`h-4 w-60 ${block}`} />
      </div>
      {variant === "grid" && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-hidden="true">
          {Array.from({ length: 10 }, (_, i) => (
            <li key={i} className={`aspect-[5/7] ${block}`} />
          ))}
        </ul>
      )}
      {variant === "list" && (
        <ul className="flex flex-col gap-2" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className={`h-16 ${block}`} />
          ))}
        </ul>
      )}
      {variant === "account" && (
        <div className="flex flex-col gap-3" aria-hidden="true">
          <div className={`h-20 ${block}`} />
          <div className="grid grid-cols-2 gap-3">
            <div className={`h-20 ${block}`} />
            <div className={`h-20 ${block}`} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className={`h-20 ${block}`} />
            ))}
          </div>
        </div>
      )}
    </PageShell>
  );
}
