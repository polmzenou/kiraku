import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { pickClientMessages } from "@/i18n/client-messages";
import { AdminNav } from "@/components/admin/AdminNav";
import { SectionTitle } from "@/components/SectionTitle";
import { requireStaff } from "@/server/admin";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Toute la section /admin : équipe vérifiée côté serveur (404 sinon), chaque page et action revérifie son rôle
 * (le DEV n'ouvre que le catalogue).
 * Pleine largeur, sans le pied de page public : barre latérale en desktop, puces en mobile.
 */
export default async function AdminLayout({ children }: LayoutProps<"/[locale]/admin">) {
  const { scope } = await requireStaff();
  const t = await getTranslations("admin");
  const messages = await getMessages();

  // Tous les messages, admin compris, pour les formulaires de l'admin (le layout racine les retire)
  return (
    <NextIntlClientProvider messages={{ ...pickClientMessages(messages), admin: messages.admin }}>
      <div className="w-full px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-8 lg:px-8 2xl:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4 pt-6 lg:pt-0">
          <div className="lg:hidden">
            <SectionTitle level={1} kanji="管理" title={t("title")} />
          </div>
          <AdminNav scope={scope} />
        </div>
        <main className="flex min-w-0 flex-col gap-6 py-6">
          <div className="hidden lg:block">
            <SectionTitle level={1} kanji="管理" title={t("title")} />
          </div>
          {children}
        </main>
      </div>
    </NextIntlClientProvider>
  );
}
