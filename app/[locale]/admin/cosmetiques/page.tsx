import { getTranslations } from "next-intl/server";
import { CosmeticForm } from "@/components/admin/CosmeticForm";
import { ProfileSettingsForm } from "@/components/admin/ProfileSettingsForm";
import { ResponsiveTable } from "@/components/admin/ResponsiveTable";
import { SettingLogList } from "@/components/admin/SettingLogList";
import { AvatarFrame } from "@/components/profile/AvatarFrame";
import { PlayerName } from "@/components/social/PlayerName";
import { buttonClasses } from "@/components/ui/Button";
import { Link } from "@/i18n/navigation";
import { parseCondition, parseLabel, type ProfileCondition } from "@/lib/profile/conditions";
import type { CosmeticInput } from "@/lib/profile/cosmetic-form";
import { isFrameStyle } from "@/lib/profile/frames";
import { isNameColorStyle } from "@/lib/profile/name-colors";
import { PROFILE_SETTING_KEYS, type ProfileSettings } from "@/lib/settings/profile-form";
import { recentSettingLogs, requireAdmin } from "@/server/admin";
import { prisma } from "@/server/db";
import { getSetting } from "@/server/settings";

const NEW: CosmeticInput = {
  id: null,
  kind: "TITLE",
  slug: "",
  label: { fr: "", frFem: "", en: "" },
  hint: { fr: "", en: "" },
  frameStyle: null,
  nameColor: null,
  condition: { type: "UNIQUE_CARDS", n: 100 },
  sortOrder: 0,
  active: true,
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Titres, cadres et couleurs de pseudo débloquables, et réglages des badges. */
export default async function AdminCosmeticsPage({ searchParams }: PageProps<"/[locale]/admin/cosmetiques">) {
  await requireAdmin();
  const sp = await searchParams;
  const editId = one(sp.edit);
  const [t, rows, values, logs] = await Promise.all([
    getTranslations("admin.cosmetics"),
    prisma.cosmetic.findMany({ orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { slug: "asc" }] }),
    Promise.all(PROFILE_SETTING_KEYS.map((k) => getSetting(k))),
    recentSettingLogs(PROFILE_SETTING_KEYS),
  ]);
  const settings = Object.fromEntries(PROFILE_SETTING_KEYS.map((k, i) => [k, values[i]])) as ProfileSettings;
  const editing = editId ? rows.find((r) => r.id === editId) : null;

  let initial: CosmeticInput | null = one(sp.nouveau) === "1" ? NEW : null;
  let seriesTitle: string | null = null;
  if (editing) {
    const label = parseLabel(editing.label);
    const hint = (editing.hint ?? {}) as { fr?: string; en?: string };
    const condition: ProfileCondition = parseCondition(editing.condition) ?? { type: "ALWAYS" };
    if (condition.type === "SERIES_COMPLETE") {
      seriesTitle = (await prisma.series.findUnique({ where: { id: condition.seriesId }, select: { titleRomaji: true } }))?.titleRomaji ?? null;
    }
    initial = {
      id: editing.id,
      kind: editing.kind,
      slug: editing.slug,
      label: { fr: label.fr, frFem: label.frFem ?? "", en: label.en ?? "" },
      hint: { fr: hint.fr ?? "", en: hint.en ?? "" },
      frameStyle: isFrameStyle(editing.frameStyle) ? editing.frameStyle : null,
      nameColor: isNameColorStyle(editing.nameColor) ? editing.nameColor : null,
      condition,
      sortOrder: editing.sortOrder,
      active: editing.active,
    };
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
          <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
        </div>
        <Link href="/admin/cosmetiques?nouveau=1" className={buttonClasses("primary")}>
          {t("new")}
        </Link>
      </div>

      {initial && (
        <section className="flex flex-col gap-3">
          <h3 className="font-title text-lg font-bold">{initial.id ? t("editTitle", { slug: initial.slug }) : t("newTitle")}</h3>
          <CosmeticForm key={initial.id ?? "new"} initial={initial} seriesTitle={seriesTitle} />
        </section>
      )}

      {rows.length === 0 ? (
        <p className="lacquer rounded-card p-4 text-sm text-text-muted">{t("empty")}</p>
      ) : (
        <ResponsiveTable
          caption={t("title")}
          columns={[
            { key: "label", label: t("columns.label"), primary: true },
            { key: "kind", label: t("columns.kind") },
            { key: "condition", label: t("columns.condition") },
            { key: "state", label: t("columns.state") },
            { key: "edit", label: t("columns.edit"), actions: true },
          ]}
          rows={rows.map((r) => {
            const label = parseLabel(r.label);
            const condition = parseCondition(r.condition);
            return {
              id: r.id,
              cells: {
                label: (
                  <span className="flex items-center gap-3">
                    {r.kind === "FRAME" && isFrameStyle(r.frameStyle) && (
                      <AvatarFrame frame={r.frameStyle} size={32}>
                        <span className="block size-8 rounded-full bg-surface-2" />
                      </AvatarFrame>
                    )}
                    <span className="flex flex-col">
                      <span className="font-bold">
                        <PlayerName
                          name={label.frFem && label.frFem !== label.fr ? `${label.fr} / ${label.frFem}` : label.fr}
                          color={r.kind === "NAME_COLOR" && isNameColorStyle(r.nameColor) ? r.nameColor : null}
                        />
                      </span>
                      <span className="text-xs text-text-muted">{r.slug}</span>
                    </span>
                  </span>
                ),
                kind: t(`kinds.${r.kind}`),
                condition: condition ? t(`conditions.${condition.type}`) + ("n" in condition ? ` · ${condition.n}` : "") : t("brokenCondition"),
                state: r.active ? t("active") : t("inactive"),
                edit: (
                  <Link href={`/admin/cosmetiques?edit=${r.id}`} className={buttonClasses()}>
                    {t("edit")}
                  </Link>
                ),
              },
            };
          })}
        />
      )}

      <ProfileSettingsForm initial={settings} />
      <SettingLogList logs={logs} />
    </div>
  );
}
