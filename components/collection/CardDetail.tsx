import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Fuda } from "@/components/fuda/Fuda";
import { FudaTurnover } from "@/components/fuda/FudaTurnover";
import { Link } from "@/i18n/navigation";
import { cardNumber, seriesTitle } from "@/lib/catalog/display";
import { RARITY_SEAL, type Rarity } from "@/lib/catalog/rarity";
import type { CatalogCardDetail } from "@/server/catalog/queries";
import { getOwnedCopies } from "@/server/collection/queries";
import { openAuctionsForCard, sellInfoFor } from "@/server/market/queries";
import { getSetting } from "@/server/settings";
import { SellButton } from "../market/SellButton";
import { RecycleControl } from "./RecycleControl";
import { ShowcaseToggle } from "./ShowcaseToggle";

/**
 * Fiche d'une carte de la collection (page /collection/[anilistId] et feuille au-dessus de la liste) :
 * grande fuda, stats, exemplaires possédés, recyclage des doublons, vitrine, lien vers le wiki.
 */
export async function CardDetail({
  card,
  ownerId,
  username,
  headingLevel = 1,
}: {
  card: CatalogCardDetail;
  ownerId: string;
  username: string;
  headingLevel?: 1 | 2;
}) {
  const [t, tMarket, tRarity, format, locale, copies, values, sellInfo, onSale] = await Promise.all([
    getTranslations("collection.card"),
    getTranslations("market.sell"),
    getTranslations("rarity"),
    getFormatter(),
    getLocale(),
    getOwnedCopies(ownerId, card.id),
    getSetting("collection.recycleValues"),
    sellInfoFor(ownerId, new Date()),
    openAuctionsForCard(ownerId, card.id),
  ]);
  const rarity = card.rarity as Rarity;
  const series = seriesTitle(card.series, locale);
  const Heading = headingLevel === 1 ? "h1" : "h2";

  const inCollection = copies.filter((c) => c.status === "COLLECTION").length;
  const inShowcase = copies.some((c) => c.showcasePosition !== null);
  const byStatus = (s: "AUCTION" | "BATTLE") => copies.filter((c) => c.status === s).length;

  return (
    <article className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
      <FudaTurnover className="mx-auto w-full max-w-[260px] md:mx-0 md:w-[300px] md:max-w-none md:shrink-0">
        <Fuda card={card} series={series} size="lg" preload />
      </FudaTurnover>

      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <header className="flex flex-col gap-1">
          <p className="text-sm text-text-muted">
            {t("number", { number: cardNumber(card.rank) })} ·{" "}
            <span aria-hidden="true" className="font-seal">{RARITY_SEAL[rarity]}</span> {tRarity(rarity)}
          </p>
          <Heading className="text-2xl font-extrabold md:text-3xl">{card.name}</Heading>
          {card.nameNative && (
            <p lang="ja" className="font-title text-lg text-text-muted">
              {card.nameNative}
            </p>
          )}
          <p className="text-sm text-text-muted">{series}</p>
        </header>

        <dl className="grid grid-cols-2 gap-3">
          <div className="lacquer rounded-card p-3">
            <dt className="text-sm text-text-muted">{t("power")}</dt>
            <dd className="text-xl font-bold tabular-nums">
              <span aria-hidden="true" className="font-seal">力</span> {card.power}
            </dd>
          </div>
          <div className="lacquer rounded-card p-3">
            <dt className="text-sm text-text-muted">{t("ki")}</dt>
            <dd className="text-xl font-bold tabular-nums">
              <span aria-hidden="true" className="font-seal">気</span> {card.ki}
            </dd>
          </div>
        </dl>

        {copies.length === 0 ? (
          <p className="lacquer rounded-card p-4 text-sm text-text-muted">{t("notOwned")}</p>
        ) : (
          <>
            <section className="flex flex-col gap-2 lacquer rounded-card p-4">
              <h3 className="font-bold">{t("copiesTitle", { count: copies.length })}</h3>
              <ul className="flex flex-col gap-1 text-sm text-text-muted">
                <li>{t("inCollection", { count: inCollection })}</li>
                {byStatus("AUCTION") > 0 && <li>{t("inAuction", { count: byStatus("AUCTION") })}</li>}
                {byStatus("BATTLE") > 0 && <li>{t("inBattle", { count: byStatus("BATTLE") })}</li>}
                <li>{t("firstObtained", { date: format.dateTime(copies[0].obtainedAt, { dateStyle: "medium" }) })}</li>
              </ul>
            </section>

            <section className="flex flex-col gap-3 lacquer rounded-card p-4">
              <h3 className="font-bold">{t("recycleTitle")}</h3>
              <p className="text-sm text-text-muted">{t("unitValue", { zeni: values[rarity] })}</p>
              <RecycleControl
                cardId={card.id}
                copies={copies.length}
                recyclable={Math.max(0, inCollection - 1)}
                unitValue={values[rarity]}
              />
            </section>

            <section className="flex flex-col gap-3">
              <ShowcaseToggle
                cardId={card.id}
                inShowcase={inShowcase}
                available={inCollection > 0}
                profileHref={`/u/${username}`}
              />
              <SellButton cardId={card.id} cardName={card.name} available={inCollection} info={sellInfo} />
              {onSale.length > 0 && (
                <ul className="flex flex-col gap-1 text-sm">
                  {onSale.map((a) => (
                    <li key={a.id}>
                      <Link href={`/marche/${a.id}`} className="inline-flex min-h-11 items-center text-link underline underline-offset-4">
                        {tMarket("saleLink", { amount: a.price })}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        <Link href={`/wiki/${card.anilistId}`} className="inline-flex min-h-11 w-fit items-center text-link underline underline-offset-4">
          {t("wiki")}
        </Link>
      </div>
    </article>
  );
}
