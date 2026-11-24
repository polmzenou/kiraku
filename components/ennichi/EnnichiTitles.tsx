import { getTranslations } from "next-intl/server";
import { ennichiTitlesOf } from "@/server/ennichi/queries";
import { TITLE_KANJI } from "./Banzuke";
import { Tsuna } from "./parts";
import "./ennichi.css";

/** Titres sumo gagnés au banzuke de l'Ennichi, sur le profil : permanents, marqués de l'édition (la corde du Yokozuna). */
export async function EnnichiTitles({ userId }: { userId: string }) {
  const titles = await ennichiTitlesOf(userId);
  if (titles.length === 0) return null;
  const t = await getTranslations("ennichi.titles");
  const yoko = titles.some((x) => x.title === "yokozuna");
  return (
    <section className="enn">
      <div className="m3-titles flex flex-col gap-3 lacquer rounded-card p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-title text-lg font-bold">{t("title")}</h2>
          <span className="text-xs text-text-muted">{t("from")}</span>
        </div>
        {yoko && <Tsuna className="m3-tsuna-prof" />}
        <div className="m3-chips">
          {titles.map((x) => (
            <span key={`${x.edition}-${x.title}`} className={`title-chip ${x.title === "yokozuna" ? "yoko" : ""}`}>
              <b lang="ja">{TITLE_KANJI[x.title]}</b>
              {t("chip", { title: x.title, edition: x.edition, rank: x.rank })}
            </span>
          ))}
        </div>
        <p className="text-xs text-text-muted">{t("stays")}</p>
      </div>
    </section>
  );
}
