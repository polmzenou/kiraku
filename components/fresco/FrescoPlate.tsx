import { useTranslations } from "next-intl";
import { frescoProgress, type FrescoView } from "@/lib/fresco/view";

/** Cartel d'une fresque sous la scène : sceau 絵, nom, progression (ou « Fresque complète »). */
export function FrescoPlate({ fresco, action }: { fresco: Pick<FrescoView, "name" | "cols" | "rows" | "pieces" | "fullImageUrl">; action?: React.ReactNode }) {
  const t = useTranslations("fresco");
  const { owned, total, complete } = frescoProgress(fresco);
  return (
    <div className="vt-plate flex flex-col items-center gap-3 text-center">
      <div className="flex max-w-full min-w-0 flex-col items-center gap-0.5">
        <span aria-hidden="true" lang="ja" className="vt-seal mb-1.5" data-vt-tone="gold">
          絵
        </span>
        <h3 className="max-w-full truncate font-title text-xl font-extrabold">{fresco.name}</h3>
        <p className={`text-xs ${complete ? "font-bold text-kin" : "text-text-muted"}`}>{complete ? t("complete") : t("progress", { owned, total })}</p>
      </div>
      {action}
    </div>
  );
}

/** Libellé lu par un lecteur d'écran pour une fresque (nom et progression). */
export function useFrescoLabel() {
  const t = useTranslations("fresco");
  return (fresco: Pick<FrescoView, "name" | "cols" | "rows" | "pieces" | "fullImageUrl">) => {
    const { owned, total, complete } = frescoProgress(fresco);
    return complete ? t("labelComplete", { name: fresco.name }) : t("label", { name: fresco.name, owned, total });
  };
}
