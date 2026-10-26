import { getTranslations } from "next-intl/server";
import { BoosterTypeForm } from "@/components/admin/BoosterTypeForm";
import { Link } from "@/i18n/navigation";
import { newBannerForm } from "@/lib/boosters/admin-form";
import { requireAdmin } from "@/server/admin";
import { getBoosterRules } from "@/server/boosters/rules";

export default async function NewBannerPage() {
  await requireAdmin();
  const [t, rules] = await Promise.all([getTranslations("admin"), getBoosterRules()]);
  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/bannieres" className="text-sm text-link underline underline-offset-4">
        ← {t("banners.title")}
      </Link>
      <h2 className="font-heading text-2xl font-bold">{t("types.newBannerTitle")}</h2>
      <BoosterTypeForm initial={newBannerForm()} featured={[]} globalCards={rules.draw.slotFloors.length} />
    </div>
  );
}
