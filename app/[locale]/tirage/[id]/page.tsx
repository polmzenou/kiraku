import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Sachet } from "@/components/boosters/Sachet";
import { Fuda } from "@/components/fuda/Fuda";
import { PageShell } from "@/components/PageShell";
import { buttonClasses } from "@/components/ui/Button";
import { Link } from "@/i18n/navigation";
import { BOOSTERS, contentsLabel } from "@/lib/boosters/catalog";
import { getPublicOpening } from "@/server/boosters/openings";

const ID = /^[A-Za-z0-9-]{8,64}$/;

async function load(id: string) {
  if (!ID.test(id)) return null;
  return getPublicOpening(id, await getLocale());
}

export async function generateMetadata({ params }: PageProps<"/[locale]/tirage/[id]">): Promise<Metadata> {
  const { id } = await params;
  const opening = await load(id);
  if (!opening) return {};
  const [t, tAccount, tBoosters] = await Promise.all([
    getTranslations("draw"),
    getTranslations("account"),
    getTranslations("boosters"),
  ]);
  const name = opening.owner.guestCode ? tAccount("guestName", { code: opening.owner.guestCode }) : opening.owner.username;
  return {
    title: t("title", { name }),
    description: t("description", { name, booster: tBoosters(`types.${opening.slug}.name`) }),
    robots: { index: false },
  };
}

/** Page publique d'un tirage, ouverte depuis « Copier le lien ». */
export default async function DrawPage({ params }: PageProps<"/[locale]/tirage/[id]">) {
  const { id } = await params;
  const opening = await load(id);
  if (!opening) notFound();

  const [t, tAccount, tBoosters, tOpening, format] = await Promise.all([
    getTranslations("draw"),
    getTranslations("account"),
    getTranslations("boosters"),
    getTranslations("opening"),
    getFormatter(),
  ]);
  const name = opening.owner.guestCode ? tAccount("guestName", { code: opening.owner.guestCode }) : opening.owner.username;
  const booster = BOOSTERS[opening.slug];

  return (
    <PageShell>
      <header className="flex items-center gap-4">
        <div className="w-14 shrink-0">
          <Sachet
            theme={booster.theme}
            name={tBoosters(`types.${opening.slug}.name`)}
            contents={contentsLabel(opening.cards.length)}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-title text-2xl font-extrabold">{t("title", { name })}</h1>
          <p className="text-sm text-text-muted">
            {tBoosters(`types.${opening.slug}.name`)} · {format.relativeTime(opening.createdAt)}
          </p>
          <div className="flex flex-wrap gap-2 text-xs font-bold">
            {opening.divine && <span className="text-rarity-mythic">{tOpening("divine")}</span>}
            {opening.golden && <span className="text-kin">{tOpening("golden")}</span>}
          </div>
        </div>
      </header>

      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {opening.cards.map((card, i) => (
          <li key={`${card.cardId}-${i}`}>
            <Link href={`/wiki/${card.anilistId}`} className="block">
              <Fuda card={card} series={card.series} size="md" />
            </Link>
          </li>
        ))}
      </ul>

      <Link href="/boosters" className={buttonClasses("shu", "w-full sm:w-auto sm:self-start")}>
        {t("cta")}
      </Link>
    </PageShell>
  );
}
