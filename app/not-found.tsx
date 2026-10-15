import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { routing } from "@/i18n/routing";
import { fontVariables } from "./fonts";

// Hors des routes localisées (ex. locale inconnue) : rendu en langue par défaut.
export default async function RootNotFound() {
  const t = await getTranslations({ locale: routing.defaultLocale, namespace: "notFound" });
  return (
    <html lang={routing.defaultLocale} data-theme="yoru" className={fontVariables}>
      <body className="flex min-h-dvh flex-col items-start gap-4 px-4 py-8">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-text-muted">{t("body")}</p>
        <Link href="/" className="inline-flex min-h-11 items-center text-link underline underline-offset-4">
          {t("back")}
        </Link>
      </body>
    </html>
  );
}
