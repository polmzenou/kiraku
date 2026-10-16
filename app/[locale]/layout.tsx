import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ConsentManager } from "@/components/consent/ConsentManager";
import { AppHeader } from "@/components/layout/AppHeader";
import { PlayerAnnouncements } from "@/components/welcome/PlayerAnnouncements";
import { AccountGate } from "@/components/legal/AccountGate";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { routing } from "@/i18n/routing";
import { pickClientMessages } from "@/i18n/client-messages";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { fontVariables } from "../fonts";
import { appUrl } from "@/server/env";

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: hasLocale(routing.locales, locale) ? locale : "fr", namespace: "metadata" });
  return {
    metadataBase: new URL(appUrl()),
    title: { default: t("title"), template: `%s · ${t("title")}` },
    description: t("description"),
    appleWebApp: { capable: true, title: t("title"), statusBarStyle: "black-translucent" },
    icons: {
      icon: [
        { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
        { url: "/icons/favicon.svg", sizes: "any", type: "image/svg+xml" },
      ],
      apple: "/icons/apple-touch-icon.png",
    },
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
  const clientMessages = pickClientMessages(await getMessages());

  return (
    <html lang={locale} data-theme={theme} className={fontVariables}>
      <body className="min-h-dvh">
        <NextIntlClientProvider messages={clientMessages}>
          <AppHeader theme={theme} />
          <AccountGate>
            {children}
            <PlayerAnnouncements />
          </AccountGate>
          <ConsentManager />
          <ServiceWorkerRegister />
        </NextIntlClientProvider>
        {/* Mesure des performances (LCP, INP, CLS) sans cookie ni identifiant : exemptée de consentement */}
        {process.env.VERCEL === "1" && <SpeedInsights />}
      </body>
    </html>
  );
}
