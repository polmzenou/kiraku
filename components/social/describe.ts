"use client";

import { useTranslations } from "next-intl";
import { describeNotification } from "@/lib/social/describe";
import type { NotificationType } from "@/lib/social/notifications";
import type { NotificationView } from "@/server/social/queries";

/** Kanji du sceau de chaque type de notification. */
export function notificationSeal(type: NotificationType): string {
  if (type === "GIFT_RECEIVED") return "贈";
  return type === "REFERRAL_QUALIFIED" ? "招" : "友";
}

/**
 * Lien et texte d'une notification, rendus dans la langue du lecteur. Sert à la page
 * /notifications et aux toasts ; le texte lui-même est dans lib/social/describe.ts (partagé
 * avec le Web Push) : un nouveau type de notification s'ajoute là une seule fois.
 */
export function useDescribeNotification() {
  const t = useTranslations("notifications");
  const tAccount = useTranslations("account");
  const tRarity = useTranslations("rarity");
  return (n: NotificationView): { text: string; href: string } =>
    describeNotification(n, {
      notifications: (key, values) => t(key, values),
      guestName: (code) => tAccount("guestName", { code }),
      rarity: (r) => tRarity(r as "COMMON"),
    });
}
