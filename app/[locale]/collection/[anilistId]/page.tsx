import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CardDetail } from "@/components/collection/CardDetail";
import { GuestBootstrap } from "@/components/GuestBootstrap";
import { PageShell } from "@/components/PageShell";
import { Link } from "@/i18n/navigation";
import { getCatalogCard } from "@/server/catalog/queries";
import { getCurrentUser } from "@/server/user";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const idSchema = z.coerce.number().int().positive().max(2_147_483_647);

/** Fiche carte en page complète (lien direct, rechargement) ; depuis la liste, elle s'ouvre en feuille. */
export default async function CollectionCardPage({ params }: PageProps<"/[locale]/collection/[anilistId]">) {
  const { anilistId } = await params;
  const id = idSchema.safeParse(anilistId);
  const [t, user, card] = await Promise.all([
    getTranslations("collection"),
    getCurrentUser(),
    id.success ? getCatalogCard(id.data) : null,
  ]);
  if (!card) notFound();
  if (!user) {
    return (
      <PageShell>
        <GuestBootstrap />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Link href="/collection" className="inline-flex min-h-11 w-fit items-center text-link underline underline-offset-4">
        {t("back")}
      </Link>
      <CardDetail card={card} ownerId={user.id} username={user.username} />
    </PageShell>
  );
}
