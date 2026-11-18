import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { isStaff } from "@/lib/admin/roles";
import { getCasinoRules } from "@/server/casino/queries";
import { getCurrentUser } from "@/server/user";

/** Casino caché par l'admin (features.casino) : introuvable pour les joueurs, l'équipe garde un aperçu. */
export default async function CasinoLayout({ children }: { children: ReactNode }) {
  const [rules, user] = await Promise.all([getCasinoRules(), getCurrentUser()]);
  if (!rules.visible && !isStaff(user?.role)) notFound();
  return children;
}
