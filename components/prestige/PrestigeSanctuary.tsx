import { getFormatter, getTranslations } from "next-intl/server";
import { keptSpan } from "@/lib/prestige/journey";
import { getSanctuary } from "@/server/prestige/profile-queries";
import { SanctuaryAltar, type Relic } from "./SanctuaryAltar";

/**
 * Sanctuaire du profil : le vrai sanctuaire (fond généré), l'autel à gradins et les cartes consacrées, la dernière en
 * haut ; au-delà de 9, le trésor du sanctuaire. Le parcours de chaque carte (cycles traversés, propriétaires successifs)
 * se lit au toucher. Les textes et les pseudos (masqués selon la visibilité des profils) sont préparés ici.
 */
export async function PrestigeSanctuary({ userId, viewerId, locale }: { userId: string; viewerId: string | null; locale: string }) {
  const entries = await getSanctuary(viewerId, userId, locale);
  if (entries.length === 0) return null;
  const [t, tVia, format] = await Promise.all([getTranslations("prestige.sanctuary"), getTranslations("collection.card.journey.via"), getFormatter()]);
  // La dernière consacrée d'abord : elle prend la place du haut de l'autel
  const relics: Relic[] = [...entries].reverse().map((e) => {
    const span = keptSpan(e.cycles);
    return {
      id: e.id,
      card: e.card,
      consecrated: t("consecratedOn", { date: format.dateTime(e.consecratedAt, { dateStyle: "medium" }) }),
      kept: span ? (span.from === span.to ? t("keptOnce", { cycle: span.from }) : t("kept", { from: span.from, to: span.to })) : null,
      owners: e.owners.map((o) => ({ name: o.name, username: o.username, via: tVia(o.via) })),
    };
  });
  return (
    <section id="sanctuaire" aria-labelledby="prestige-sanctuary" className="flex scroll-mt-20 flex-col gap-3">
      <h2 id="prestige-sanctuary" className="flex items-center gap-2 font-heading text-xl">
        <span aria-hidden="true" lang="ja" className="font-seal text-kin">奉</span>
        {t("title")}
      </h2>
      <SanctuaryAltar
        relics={relics}
        labels={{ treasure: t("treasure", { count: Math.max(0, relics.length - 9) }), journey: t("journey"), hint: t("hint") }}
      />
    </section>
  );
}
