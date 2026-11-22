import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { KyaraDecision } from "@/components/admin/kyara/KyaraDecision";
import { KyaraProcessButton } from "@/components/admin/kyara/KyaraProcessButton";
import { Link } from "@/i18n/navigation";
import { canProcessKyaraImports } from "@/lib/admin/roles";
import { kyaraProfileUrl } from "@/lib/kyara/profile-url";
import { CONVERTED_KINDS } from "@/lib/kyara/summary";
import { requireAdminView } from "@/server/admin";
import { prisma } from "@/server/db";
import { kyaraImportDetail } from "@/server/kyara/queries";

/** Fiche d'une demande d'import Kyara : joueur, vérification Discord, collection lue, aperçu et décisions. */
export default async function AdminKyaraImportPage({ params }: PageProps<"/[locale]/admin/kyara/[importId]">) {
  const { user } = await requireAdminView();
  const { importId } = await params;
  const [t, format, detail] = await Promise.all([getTranslations("admin.kyara"), getFormatter(), kyaraImportDetail(importId)]);
  if (!detail) notFound();
  const { row, preview, sameProfile } = detail;
  const now = new Date().getTime();
  const discord = row.userId
    ? await prisma.account.findFirst({ where: { userId: row.userId, provider: "discord" }, select: { providerAccountId: true } })
    : null;
  const canProcess = canProcessKyaraImports(user.role) && row.userId !== user.id;
  const when = (d: Date | null) => (d ? format.dateTime(d, { dateStyle: "medium", timeStyle: "short" }) : "—");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/admin/kyara" className="w-fit text-sm underline underline-offset-4">
          {t("detail.back")}
        </Link>
        <h2 className="font-heading text-2xl font-bold">
          {row.user ? row.user.username : t("queue.deletedPlayer")} · {t(`detail.status.${row.status}`)}
        </h2>
      </div>

      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div className="lacquer rounded-card p-3">
          <dt className="text-text-muted">{t("detail.requested")}</dt>
          <dd>
            {when(row.requestedAt)} · {t("detail.deadline", { date: when(row.deadlineAt) })}
          </dd>
        </div>
        <div className="lacquer rounded-card p-3">
          <dt className="text-text-muted">{t("detail.player")}</dt>
          <dd className="flex flex-col">
            {row.user ? (
              <>
                <Link href={`/admin/utilisateurs/${row.user.id}`} className="w-fit underline underline-offset-4">
                  {row.user.username}
                </Link>
                <span className="text-xs text-text-muted">{t("detail.accountAge", { date: format.relativeTime(row.user.createdAt, now) })}</span>
                {row.user.bannedAt && <span className="text-xs font-bold text-shu">{t("detail.banned")}</span>}
              </>
            ) : (
              t("queue.deletedPlayer")
            )}
          </dd>
        </div>
        <div className="lacquer rounded-card p-3">
          <dt className="text-text-muted">{t("detail.discord")}</dt>
          <dd className="flex flex-col break-all">
            <span>{t("detail.discordKiraku", { id: row.discordId })}</span>
            <span>{t("detail.discordKyara", { id: row.kyaraDiscordId ?? "—" })}</span>
            {row.discordVerified === true && <span className="font-bold text-hisui">{t("detail.discordMatch")}</span>}
            {row.discordVerified === false && <span className="font-bold text-kin">{t("detail.discordConfirmed")}</span>}
            {discord && discord.providerAccountId !== row.discordId && <span className="font-bold text-shu">{t("detail.discordChanged")}</span>}
          </dd>
        </div>
        <div className="lacquer rounded-card p-3">
          <dt className="text-text-muted">{t("detail.kyara")}</dt>
          <dd className="flex flex-col">
            <a href={kyaraProfileUrl(row.kyaraUserId)} target="_blank" rel="noopener noreferrer" className="w-fit text-ai underline underline-offset-4">
              {row.kyaraUsername ?? t("queue.kyaraProfile")}
            </a>
            {row.snapshotCards !== null && (
              <span className="text-xs text-text-muted">
                {t("detail.read", {
                  cards: row.snapshotCards,
                  copies: row.snapshotCopies ?? 0,
                  announced: row.snapshotTotal !== null ? "yes" : "no",
                  total: row.snapshotTotal ?? 0,
                  date: when(row.readAt),
                })}
              </span>
            )}
            {sameProfile > 0 && <span className="text-xs font-bold text-kin">{t("detail.sameProfile", { count: sameProfile })}</span>}
          </dd>
        </div>
      </dl>

      {row.status === "PENDING" && canProcess && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-text-muted">{t("detail.processHelp")}</p>
          <KyaraProcessButton importId={row.id} />
        </div>
      )}

      {preview && (
        <section className="flex flex-col gap-2 lacquer rounded-card p-4 text-sm" aria-labelledby="kyara-preview">
          <h3 id="kyara-preview" className="font-title text-lg font-bold">
            {t("detail.preview", { cards: preview.grant.length, zeni: preview.zeni })}
          </h3>
          {preview.capped && <p className="text-kin">{t("detail.capped", { raw: preview.zeniRaw })}</p>}
          <ul className="flex flex-col gap-1 text-text-muted">
            {CONVERTED_KINDS.map((k) => (
              <li key={k}>{t(`detail.kind.${k}`, { count: preview.byKind[k].count, zeni: preview.byKind[k].zeni })}</li>
            ))}
            <li>{t("detail.extraCopies", { count: preview.extraCopies })}</li>
          </ul>
          {row.snapshotTotal !== null && row.snapshotCards !== null && row.snapshotTotal > row.snapshotCards && (
            <p className="font-bold text-shu">{t("detail.truncated", { read: row.snapshotCards, total: row.snapshotTotal })}</p>
          )}
        </section>
      )}

      {row.status === "DONE" && (
        <p className="text-sm">{t("detail.done", { cards: row.grantedCards ?? 0, zeni: row.grantedZeni ?? 0, date: when(row.appliedAt) })}</p>
      )}
      {row.status === "REJECTED" && (
        <p className="text-sm">
          {t("detail.rejected", { reason: row.rejectCode ?? "OTHER", date: when(row.rejectedAt) })}
          {row.rejectNote && ` « ${row.rejectNote} »`}
        </p>
      )}

      {canProcess && (row.status === "PENDING" || row.status === "READY" || row.status === "REJECTED") && (
        <KyaraDecision
          importId={row.id}
          status={row.status}
          expected={preview ? { cards: preview.grant.length, zeni: preview.zeni } : null}
        />
      )}
      <p className="text-xs text-text-muted">{t("detail.removeFriend")}</p>
    </div>
  );
}
