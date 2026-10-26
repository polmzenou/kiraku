import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { BoosterArt } from "@/components/boosters/BoosterArt";
import { Fuda } from "@/components/fuda/Fuda";
import { PageShell } from "@/components/PageShell";
import { buttonClasses } from "@/components/ui/Button";
import { Link } from "@/i18n/navigation";
import { contentsLabel } from "@/lib/boosters/catalog";
import { FALLBACK_THEME, localize } from "@/lib/boosters/types";
import { getPublicOpening } from "@/server/boosters/openings";
import { getBoosterTypeEntry } from "@/server/boosters/pools";
import { getCurrentUser } from "@/server/user";

const ID = /^[A-Za-z0-9-]{8,64}$/;

async function load(id: string) {
  if (!ID.test(id)) return null;
  const locale = await getLocale();
  const viewer = await getCurrentUser();
  const opening = await getPublicOpening(id, locale, viewer?.id ?? null);
  if (!opening) return null;
  const entry = await getBoosterTypeEntry(opening.slug);
  return { opening, type: entry?.type ?? null, boosterName: entry ? localize(entry.type.name, locale) : opening.slug };
}

/** Pseudo affiché : « Un joueur » si le profil le cache, « Invité-XXXX » pour un invité. */
function ownerName(
  loaded: { opening: { owner: { name: string; guestCode: string | null } } },
  t: { anonymous: () => string; guest: (code: string) => string },
): string {
  return loaded.opening.owner.guestCode ? t.guest(loaded.opening.owner.guestCode) : loaded.opening.owner.name;
}

export async function generateMetadata({ params }: PageProps<"/[locale]/tirage/[id]">): Promise<Metadata> {
  const { id } = await params;
  const loaded = await load(id);
  if (!loaded) return {};
  const [t, tAccount] = await Promise.all([getTranslations("draw"), getTranslations("account")]);
  const { boosterName } = loaded;
  const name = ownerName(loaded, { anonymous: () => t("anonymous"), guest: (code) => tAccount("guestName", { code }) });
  return {
    title: t("title", { name }),
    description: t("description", { name, booster: boosterName }),
    robots: { index: false },
  };
}

/** Page publique d'un tirage, ouverte depuis « Copier le lien ». */
export default async function DrawPage({ params }: PageProps<"/[locale]/tirage/[id]">) {
  const { id } = await params;
  const loaded = await load(id);
  if (!loaded) notFound();
  const { opening, type, boosterName } = loaded;

  const [t, tAccount, tOpening, format] = await Promise.all([
    getTranslations("draw"),
    getTranslations("account"),
    getTranslations("opening"),
    getFormatter(),
  ]);
  const name = ownerName(loaded, { anonymous: () => t("anonymous"), guest: (code) => tAccount("guestName", { code }) });

  return (
    <PageShell>
      <header className="flex items-center gap-4">
        <div className="w-14 shrink-0">
          <BoosterArt
            shape={type?.shape ?? "SACHET"}
            theme={type?.theme ?? FALLBACK_THEME}
            emblem={type?.emblem ?? "福"}
            name={boosterName}
            contents={contentsLabel(opening.cards.length)}
            compact
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-heading text-2xl font-extrabold">{t("title", { name })}</h1>
          <p className="text-sm text-text-muted">
            {boosterName} · {format.relativeTime(opening.createdAt)}
          </p>
          <div className="flex flex-wrap gap-2 text-xs font-bold">
            {opening.divine && <span className="text-rarity-mythic">{tOpening("divine")}</span>}
            {opening.golden && <span className="text-kin">{tOpening("golden")}</span>}
          </div>
        </div>
      </header>

      <ul className={`grid gap-4 ${opening.cards.length > 6 ? "grid-cols-4 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-4"}`}>
        {opening.cards.map((card, i) => (
          <li key={`${card.cardId}-${i}`}>
            <Link href={`/wiki/${card.anilistId}`} className="block">
              <Fuda card={card} series={card.series} size={opening.cards.length > 6 ? "sm" : "md"} />
            </Link>
          </li>
        ))}
      </ul>

      <Link href="/" className={buttonClasses("primary", "w-full sm:w-auto sm:self-start")}>
        {t("cta")}
      </Link>
    </PageShell>
  );
}
