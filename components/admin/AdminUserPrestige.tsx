import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { toRoman } from "@/lib/prestige/roman";
import { adminUserPrestige } from "@/server/prestige/admin-queries";

/** Fiche joueur de l'admin : prestige, cycles, héritières et gravées possédées, cartes consacrées. Lecture seule. */
export async function AdminUserPrestige({ userId }: { userId: string }) {
  const data = await adminUserPrestige(userId);
  if (!data || (data.prestige === 0 && data.special.length === 0 && data.consecrated.length === 0)) return null;
  const [t, format] = await Promise.all([getTranslations("admin.prestige.user"), getFormatter()]);
  return (
    <section className="flex flex-col gap-3 lacquer rounded-card p-4">
      <h3 className="flex items-center gap-2 font-title text-xl font-bold">
        <span aria-hidden="true" lang="ja" className="font-seal text-kin">転</span>
        {t("title")}
      </h3>
      <p className="text-sm">
        {data.prestige > 0
          ? t("level", { roman: toRoman(data.prestige), level: data.prestige, date: data.prestigedAt ? format.dateTime(data.prestigedAt, { dateStyle: "medium" }) : "—" })
          : t("none")}
      </p>
      {data.cycles.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {data.cycles.map((c) => (
            <li key={c.number} className="flex flex-wrap gap-x-3 border-t border-border py-1.5">
              <b>{t("cycle", { number: c.number })}</b>
              <span className="text-text-muted">{t("cycleRow", { rank: c.globalRank, cards: c.uniqueCards, zeni: c.zeni })}</span>
              <span className="text-text-muted">{format.dateTime(c.createdAt, { dateStyle: "medium" })}</span>
            </li>
          ))}
        </ul>
      )}
      {data.special.length > 0 && (
        <>
          <h4 className="text-sm font-bold">{t("special", { count: data.special.length })}</h4>
          <ul className="flex flex-col gap-1 text-sm">
            {data.special.map((c) => (
              <li key={c.id} className="flex flex-wrap gap-x-3 border-t border-border py-1.5">
                <span className="font-bold">{c.card.name}</span>
                {c.printing !== null && <span className="text-shu">{t("edition", { printing: c.printing, serial: c.serial ?? 0, size: c.edition?.size ?? 0 })}</span>}
                {c.heritage > 0 && <span className="text-kin">{t("heritage", { level: c.heritage, kept: c.keptByOwner })}</span>}
                {c.status !== "COLLECTION" && <span className="text-text-muted">{c.status}</span>}
                {/* Prestige modifiable dans la liste des exemplaires de la carte (formulaire des cartes de la fiche) */}
                <Link href={{ pathname: `/admin/utilisateurs/${userId}`, query: { card: c.cardId }, hash: "admin-card-form" }} className="text-link underline underline-offset-4">
                  {t("edit")}<span className="sr-only"> {c.card.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      {data.consecrated.length > 0 && (
        <>
          <h4 className="text-sm font-bold">{t("consecrated", { count: data.consecrated.length })}</h4>
          <ul className="flex flex-col gap-1 text-sm">
            {data.consecrated.map((c) => (
              <li key={c.id} className="flex flex-wrap gap-x-3 border-t border-border py-1.5">
                <span className="font-bold">{c.card.name}</span>
                {c.printing !== null && <span className="text-shu">{t("editionShort", { printing: c.printing, serial: c.serial ?? 0 })}</span>}
                <span className="text-text-muted">{format.dateTime(c.consecratedAt, { dateStyle: "medium" })}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
