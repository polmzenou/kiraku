import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

// Un seul module pour l'instant : on va droit aux boosters
export default async function AdminHome() {
  redirect({ href: "/admin/boosters", locale: await getLocale() });
}
