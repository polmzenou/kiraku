import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { getSetting } from "@/server/settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("casino");
  return { title: t("title"), robots: { index: false, follow: true } };
}

/** Casino : simple écran d'attente (« Bientôt »), affiché tant que l'interrupteur features.casino est allumé. */
export default async function CasinoPage() {
  if (!(await getSetting("features.casino"))) notFound();
  const t = await getTranslations("casino");
  return (
    <PageShell>
      <section className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 py-10 text-center">
        <span aria-hidden="true" lang="ja" className="font-seal text-7xl leading-none text-kin">
          賭
        </span>
        <span className="rounded-sm border border-kin/60 px-2 py-0.5 text-xs font-bold tracking-wide text-kin uppercase">
          {t("soon")}
        </span>
        <h1 className="font-title text-3xl font-extrabold">{t("title")}</h1>
        <p className="text-text-muted">{t("body")}</p>
        <ButtonLink href="/">{t("back")}</ButtonLink>
      </section>
    </PageShell>
  );
}
