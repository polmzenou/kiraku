import Image from "next/image";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { AnnouncePublishButton } from "@/components/admin/referral/AnnouncePublishButton";
import { ReferralAdminTabs } from "@/components/admin/referral/ReferralAdminTabs";
import { canManageReferrals } from "@/lib/admin/roles";
import type { DiscordMessageBody } from "@/lib/discord/community";
import { requireAdminView } from "@/server/admin";
import { referralAnnouncePayload, referralAnnounceState } from "@/server/discord/referral-announce";
import { heldReferralCount } from "@/server/referral/admin-queries";

type Format = Awaited<ReturnType<typeof getFormatter>>;

/** Texte Discord pour l'aperçu : **gras** et horodatages <t:…:F> lus dans le fuseau du lecteur. */
function discordMarkdown(text: string, format: Format): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|<t:\d+:[A-Za-z]>)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <b key={i}>{part.slice(2, -2)}</b>;
    const stamp = part.match(/^<t:(\d+):[A-Za-z]>$/);
    if (stamp) return <span key={i}>{format.dateTime(new Date(Number(stamp[1]) * 1000), { dateStyle: "full", timeStyle: "short" })}</span>;
    return part;
  });
}

const hex = (color: number | undefined) => `#${(color ?? 0x3a322a).toString(16).padStart(6, "0")}`;
/** Image d'un encadré : le chemin du site (les fichiers sont dans public/), pour next/image. */
const localPath = (url: string) => {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
};

/** Aperçu indicatif du message (mise en page proche de Discord) : texte, encadrés, champs, image, bouton. */
async function DiscordPreview({ payload }: { payload: DiscordMessageBody }) {
  const format = await getFormatter();
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-[#313338] p-4 text-[#dbdee1]">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" lang="ja" className="flex size-9 items-center justify-center rounded-full bg-shu-btn font-seal text-washi-paper">
          気
        </span>
        <b className="text-white">Kiraku</b>
        <span className="rounded-sm bg-[#5865f2] px-1 text-[10px] font-bold text-white">BOT</span>
      </div>
      {payload.content && <p className="w-fit rounded-sm bg-[#5865f2]/30 px-1 text-sm text-[#c9cdfb]">{payload.content}</p>}
      {payload.embeds?.map((e, i) => {
        const src = e.image ? localPath(e.image.url) : null;
        return (
          <div key={i} className="flex max-w-xl flex-col gap-2 rounded-sm border-l-4 bg-[#2b2d31] p-3" style={{ borderLeftColor: hex(e.color) }}>
            {e.title && <b className="text-white">{e.title}</b>}
            {e.description && <p className="text-sm">{discordMarkdown(e.description, format)}</p>}
            {e.fields?.map((f) => (
              <div key={f.name} className="flex flex-col text-sm">
                <b className="text-white">{f.name}</b>
                {f.value.split("\n").map((line, j) => (
                  <span key={j}>{discordMarkdown(line, format)}</span>
                ))}
              </div>
            ))}
            {src && <Image src={src} alt="" width={1600} height={900} sizes="(min-width: 640px) 576px, 100vw" className="h-auto w-full rounded-sm" />}
          </div>
        );
      })}
      {payload.components?.[0]?.components.map((b) => (
        <span key={b.label} className="w-fit rounded-sm bg-[#4e5058] px-3 py-1.5 text-sm font-bold text-white">
          {b.label} ↗
        </span>
      ))}
    </div>
  );
}

/**
 * Annonce du lancement à la communauté (maquette « Annonce détaillée » de l'atelier équipe) : l'état de la publication,
 * le bouton (toute l'équipe, ADMIN et DEV) et l'aperçu du message tel qu'il partirait, avec les montants réglés.
 */
export default async function AdminReferralAnnouncePage() {
  const { user } = await requireAdminView();
  const [t, format, state, payload, held] = await Promise.all([
    getTranslations("admin.referralV2.announce"),
    getFormatter(),
    referralAnnounceState(),
    referralAnnouncePayload(),
    heldReferralCount(),
  ]);
  const canManage = canManageReferrals(user.role);

  return (
    <div className="flex flex-col gap-6">
      <ReferralAdminTabs active="announce" held={held} />
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
      </div>
      <section className="flex flex-col gap-3 lacquer rounded-card p-4">
        {!state.configured ? (
          <p className="text-sm text-text-muted">{t("notConfigured")}</p>
        ) : (
          <>
            <p className="flex flex-wrap items-center gap-2 text-sm">
              {state.publishedAt ? (
                <>
                  <span className="rounded-pill border border-hisui/60 px-2.5 py-0.5 text-xs font-bold text-hisui">
                    {t("published", { date: format.dateTime(state.publishedAt, { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }) })}
                  </span>
                  {state.url && (
                    <a href={state.url} target="_blank" rel="noopener noreferrer" className="font-bold text-link underline underline-offset-4">
                      {t("open")}
                    </a>
                  )}
                </>
              ) : (
                <span className="text-text-muted">{t("notYet")}</span>
              )}
            </p>
            {canManage ? <AnnouncePublishButton published={state.publishedAt !== null} /> : <p className="text-sm text-text-muted">{t("readOnly")}</p>}
          </>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="font-title text-lg font-bold">{t("preview")}</h3>
        <p className="text-xs text-text-muted">{t("previewNote")}</p>
        <DiscordPreview payload={payload} />
      </section>
    </div>
  );
}
