import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Fuda } from "@/components/fuda/Fuda";
import { FudaTurnover } from "@/components/fuda/FudaTurnover";
import { Link } from "@/i18n/navigation";
import { cardNumber, seriesTitle } from "@/lib/catalog/display";
import { RARITY_SEAL, type Rarity } from "@/lib/catalog/rarity";
import { isSpecialCopy } from "@/lib/collection/copies";
import { copyRecycleValue } from "@/lib/collection/recycle";
import { canConsecrate, heritageCap } from "@/lib/prestige/heritage";
import { fudaCopyOf } from "@/lib/prestige/printing";
import { getBattleRules, getCardKit } from "@/server/battle/queries";
import type { CatalogCardDetail } from "@/server/catalog/queries";
import { getOwnedCopies } from "@/server/collection/queries";
import { openAuctionsForCard, sellInfoFor } from "@/server/market/queries";
import { getSetting } from "@/server/settings";
import { copyJourneys, printingStats, type JourneyStep, type PrintingStats } from "@/server/prestige/copies";
import { getPrestigeRules, getPrintingSeals } from "@/server/prestige/rules";
import { SellButton } from "../market/SellButton";
import { ButtonLink } from "../ui/ButtonLink";
import { RecycleControl } from "./RecycleControl";
import { ConsecrateButton } from "../prestige/ConsecrateButton";
import { CopyJourney } from "./CopyJourney";
import { RecycleCopyButton } from "./RecycleCopyButton";
import { ShowcaseToggle } from "./ShowcaseToggle";

/**
 * Fiche d'une carte de la collection (page /collection/[anilistId] et feuille au-dessus de la liste) :
 * grande fuda, stats, exemplaires possédés, recyclage des doublons, vitrine, lien vers le wiki.
 */
export async function CardDetail({
  card,
  ownerId,
  username,
  isGuest = false,
  headingLevel = 1,
}: {
  card: CatalogCardDetail;
  ownerId: string;
  username: string;
  /** Les invités ne combattent pas : pas de lien vers l'atelier. */
  isGuest?: boolean;
  headingLevel?: 1 | 2;
}) {
  const [t, tMarket, tRarity, tAtelier, tBattle, format, locale, copies, values, prestige, sellInfo, onSale, rules] = await Promise.all([
    getTranslations("collection.card"),
    getTranslations("market.sell"),
    getTranslations("rarity"),
    getTranslations("battle.atelier"),
    getTranslations("battle"),
    getFormatter(),
    getLocale(),
    getOwnedCopies(ownerId, card.id),
    getSetting("collection.recycleValues"),
    getPrestigeRules(),
    sellInfoFor(ownerId, new Date(), card.rarity),
    openAuctionsForCard(ownerId, card.id),
    getBattleRules(),
  ]);
  // Kit qui combat : celui choisi à l'atelier, sinon le tirage de la carte
  const kit = copies.length > 0 && rules.enabled ? await getCardKit(ownerId, card.id, rules) : null;
  const rarity = card.rarity as Rarity;
  const series = seriesTitle(card.series, locale);
  const Heading = headingLevel === 1 ? "h1" : "h2";

  const inCollection = copies.filter((c) => c.status === "COLLECTION").length;
  // Prestige : les exemplaires spéciaux (héritiers, gravés) ne partent jamais par un choix du serveur ; les
  // doublons recyclables et la vente rapide ne comptent que les ordinaires
  const special = copies.filter((c) => isSpecialCopy(c));
  const ordinaryInCollection = copies.filter((c) => c.status === "COLLECTION" && !isSpecialCopy(c)).length;
  const inShowcase = copies.some((c) => c.inShowcase);
  const byStatus = (s: "AUCTION" | "BATTLE" | "CASINO" | "EXPEDITION") => copies.filter((c) => c.status === s).length;
  // Fiche de chaque exemplaire spécial : provenance, gravées encore en circulation, sceaux des tirages
  const [journeys, stats, seals]: [Map<string, JourneyStep[]>, PrintingStats[], Record<string, string>] =
    special.length > 0
      ? await Promise.all([copyJourneys(ownerId, special.map((c) => c.id)), special.some((c) => c.printing !== null) ? printingStats(card.id) : [], getPrintingSeals()])
      : [new Map(), [], {}];
  const statsOf = new Map(stats.map((s) => [s.printing, s]));

  return (
    <article className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
      <FudaTurnover rarity={card.rarity} className="mx-auto w-full max-w-[260px] md:mx-0 md:w-[300px] md:max-w-none md:shrink-0">
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
                {byStatus("CASINO") > 0 && <li>{t("inCasino", { count: byStatus("CASINO") })}</li>}
                {byStatus("EXPEDITION") > 0 && <li>{t("inExpedition", { count: byStatus("EXPEDITION") })}</li>}
                <li>{t("firstObtained", { date: format.dateTime(copies[0].obtainedAt, { dateStyle: "medium" }) })}</li>
              </ul>
            </section>

            {special.length > 0 && (
              <section className="flex flex-col gap-3 lacquer rounded-card p-4">
                <h3 className="font-bold">{t("specialTitle", { count: special.length })}</h3>
                <ul className="flex flex-col gap-4">
                  {special.map((c) => {
                    const copy = fudaCopyOf(c, seals);
                    const printing = c.printing !== null ? statsOf.get(c.printing) : undefined;
                    return (
                      <li key={c.id} className="flex gap-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
                        <div className="w-20 shrink-0">
                          <Fuda card={{ ...card, copy }} size="sm" still />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                          <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                            {copy?.serial != null && (
                              <span className="font-bold text-shu">
                                {copy.seal && <span lang="ja" className="font-seal">{copy.seal} </span>}
                                {copy.size != null ? t("editionOf", { serial: copy.serial, size: copy.size }) : t("edition", { serial: copy.serial })}
                              </span>
                            )}
                            {c.heritage > 0 && <span className="font-bold text-kin">{t("heritage", { level: c.heritage })}</span>}
                            {c.status !== "COLLECTION" && <span className="text-text-muted">{t("specialBusy")}</span>}
                          </p>
                          {printing && <p className="text-xs text-text-muted">{t("circulation", { issued: printing.issued, alive: printing.alive, size: printing.size })}</p>}
                          <CopyJourney steps={journeys.get(c.id) ?? []} />
                          {/* Héritière au plafond, gardée par le joueur : elle peut entrer au sanctuaire */}
                          {prestige.enabled && !isGuest && c.status === "COLLECTION" && canConsecrate(c, prestige) && (
                            <ConsecrateButton
                              userCardId={c.id}
                              card={{ name: card.name, nameNative: card.nameNative, imageUrl: card.imageUrl, rank: card.rank, rarity: card.rarity, power: card.power, ki: card.ki, appearance: card.appearance, formName: card.formName, spoiler: card.spoiler, copy }}
                              username={username}
                            />
                          )}
                          {prestige.enabled && c.heritage >= heritageCap(prestige) && !canConsecrate(c, prestige) && (
                            <p className="text-xs text-text-muted">{t("consecrateLater")}</p>
                          )}
                          {c.status === "COLLECTION" && (
                            <RecycleCopyButton
                              userCardId={c.id}
                              engraved={c.printing !== null}
                              gain={copyRecycleValue({ rarity, printing: c.printing }, values, prestige.recycleMultiplier)}
                            />
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {kit && (
              <section className="flex flex-col gap-3 lacquer rounded-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-bold">{tAtelier("kitTitle")}</h3>
                  {rules.abilityShopEnabled && !isGuest && (
                    <ButtonLink href={`/combat/atelier?carte=${encodeURIComponent(card.id)}`} size="sm">
                      {tAtelier("kitEdit")}
                    </ButtonLink>
                  )}
                </div>
                <dl className="flex flex-col gap-1 text-sm">
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="text-text-muted">{tAtelier("kitPassives")}</dt>
                    <dd>{kit.kit.keywords.length === 0 ? tAtelier("kitNone") : kit.kit.keywords.map((k) => tBattle(`keywords.${k}.name`)).join(" · ")}</dd>
                  </div>
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="text-text-muted">{tAtelier("techniqueSlot")}</dt>
                    <dd>{tBattle(`techniques.${kit.kit.technique}.name`)}</dd>
                  </div>
                  {kit.ultimate && (
                    <div className="flex flex-wrap gap-x-2">
                      <dt className="text-text-muted">{tAtelier("ultimateTitle")}</dt>
                      <dd className="font-bold text-kin">{tBattle(`ultimates.${kit.ultimate}.name`)}</dd>
                    </div>
                  )}
                </dl>
              </section>
            )}

            <section className="flex flex-col gap-3 lacquer rounded-card p-4">
              <h3 className="font-bold">{t("recycleTitle")}</h3>
              <p className="text-sm text-text-muted">{t("unitValue", { zeni: values[rarity] })}</p>
              <RecycleControl
                cardId={card.id}
                copies={copies.length}
                recyclable={Math.max(0, ordinaryInCollection - 1)}
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
              <SellButton cardId={card.id} cardName={card.name} available={ordinaryInCollection} info={sellInfo} />
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
