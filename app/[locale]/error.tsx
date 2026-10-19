"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Link } from "@/i18n/navigation";

/**
 * Erreur inattendue dans une page : message générique (aucun détail technique côté client), la
 * référence `digest` relie l'incident aux logs du serveur.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("error");
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60dvh] w-full max-w-md flex-col items-start justify-center gap-4 px-4 py-10">
      <span aria-hidden="true" lang="ja" className="font-seal text-5xl text-shu">
        乱
      </span>
      <h1 className="font-title text-2xl font-extrabold">{t("title")}</h1>
      <p className="text-text-muted">{t("body")}</p>
      {error.digest && <p className="text-xs text-text-muted">{t("reference", { digest: error.digest })}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="primary" onClick={reset}>
          {t("retry")}
        </Button>
        <Link href="/" className="inline-flex min-h-11 items-center px-2 text-link underline underline-offset-4">
          {t("home")}
        </Link>
      </div>
    </main>
  );
}
