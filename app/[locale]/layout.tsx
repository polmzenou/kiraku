import type { Metadata, Viewport } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { routing } from "@/i18n/routing";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { fontVariables } from "../fonts";

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: hasLocale(routing.locales, locale) ? locale : "fr", namespace: "metadata" });
  return {
    title: { default: t("title"), template: `%s · ${t("title")}` },
    description: t("description"),
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#15120F" },
    { media: "(prefers-color-scheme: light)", color: "#F3ECDF" },
  ],
};

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html lang={locale} data-theme={theme} className={fontVariables}>
      <body className="min-h-dvh">
        <NextIntlClientProvider>
          <AppHeader theme={theme} />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
