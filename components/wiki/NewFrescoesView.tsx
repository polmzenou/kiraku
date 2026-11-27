import { useTranslations } from "next-intl";
import type { FrescoView } from "@/lib/fresco/view";
import { SectionTitle } from "../SectionTitle";
import { NewFrescoCard, type NewFresco } from "./NewFrescoCard";

/** Onglet « Nouvelles fresques » : explication, puis chaque fresque publiée, la plus récente d'abord. */
export function NewFrescoesView({ frescoes, progress, guest }: { frescoes: NewFresco[]; progress: Map<string, FrescoView>; guest: boolean }) {
  const t = useTranslations("fresco.news");
  return (
    <div className="flex flex-col gap-6">
      <SectionTitle level={1} kanji="絵" title={t("title")} subtitle={t("intro")} />
      {frescoes.length === 0 ? (
        <p className="lacquer rounded-card p-6 text-center text-text-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {frescoes.map((f) => (
            <li key={f.id}>
              <NewFrescoCard fresco={f} progress={progress.get(f.id) ?? null} guest={guest} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
