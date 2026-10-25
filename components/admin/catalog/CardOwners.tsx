import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { CARD_OWNERS_SHOWN, cardOwners } from "@/server/catalog/admin-queries";

/** Fiche d'une carte : combien de joueurs la possèdent, en combien d'exemplaires, et lesquels. */
export async function CardOwners({ cardId }: { cardId: string }) {
  const [t, format, data] = await Promise.all([getTranslations("admin.catalog.owners"), getFormatter(), cardOwners(cardId)]);
  return (
    <section aria-labelledby="card-owners" className="rounded-card border border-border bg-surface p-5">
      <h3 id="card-owners" className="mb-3 font-title text-xl font-bold">{t("title")}</h3>
      <dl className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-control bg-surface-2 p-3">
          <dt className="text-xs text-text-muted">{t("owners")}</dt>
          <dd className="text-2xl font-bold tabular-nums">{format.number(data.owners)}</dd>
        </div>
        <div className="rounded-control bg-surface-2 p-3">
          <dt className="text-xs text-text-muted">{t("copies")}</dt>
          <dd className="text-2xl font-bold tabular-nums">{format.number(data.copies)}</dd>
        </div>
      </dl>
      {data.list.length === 0 ? (
        <p className="text-sm text-text-muted">{t("empty")}</p>
      ) : (
        <>
          <ul className="divide-y divide-border text-sm">
            {data.list.map((o) => (
              <li key={o.userId} className="flex min-h-11 items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <Link href={`/admin/utilisateurs/${o.userId}`} className="truncate text-link underline underline-offset-4">{o.username}</Link>
                  {o.isGuest && <span className="shrink-0 rounded-pill border border-border px-2 text-xs text-text-muted">{t("guest")}</span>}
                </span>
                <span className="shrink-0 tabular-nums text-text-muted">{t("copiesOf", { count: o.copies })}</span>
              </li>
            ))}
          </ul>
          {data.owners > data.list.length && <p className="mt-3 text-xs text-text-muted">{t("truncated", { count: CARD_OWNERS_SHOWN })}</p>}
        </>
      )}
    </section>
  );
}
