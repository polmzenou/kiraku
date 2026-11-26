import { getFormatter, getTranslations } from "next-intl/server";
import type { EnnichiView } from "@/server/ennichi/queries";
import { PageShell } from "../PageShell";
import { Seal } from "./Seal";

/**
 * Fête coupée ou seulement annoncée : la même page pour /ennichi et ses parties (lanternes, banzuke, omikuji), qui ne
 * montrent ni paliers, ni cagnotte, ni « ouvre un booster » tant qu'une ouverture ne compte pas encore.
 */
export async function EnnichiNotStarted({ view }: { view: EnnichiView }) {
  const [t, format] = await Promise.all([getTranslations("ennichi"), getFormatter()]);
  return (
    <PageShell>
      <section className="flex flex-col gap-3 lacquer rounded-card p-4">
        <div className="flex items-center gap-3">
          <Seal kanji="祭" />
          <h1 className="font-heading text-2xl">{t("title")}</h1>
        </div>
        <p>
          {view.phase === "before" && view.startsAt
            ? t("page.startsOn", { date: format.dateTime(new Date(view.startsAt), { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }) })
            : t("page.off")}
        </p>
      </section>
    </PageShell>
  );
}
