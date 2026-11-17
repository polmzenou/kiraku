import { getTranslations } from "next-intl/server";
import { DiscordSettingsForm } from "@/components/admin/DiscordSettingsForm";
import { DiscordCasinoPanel } from "@/components/admin/DiscordCasinoPanel";
import { DiscordCommunityPanel } from "@/components/admin/DiscordCommunityPanel";
import { bigFlipMessage, casinoOpeningMessage, casinoTeaserMessage } from "@/lib/discord/casino-message";
import { getCasinoRules } from "@/server/casino/queries";
import { SettingLogList } from "@/components/admin/SettingLogList";
import { DISCORD_SETTING_KEYS, type DiscordSettings } from "@/lib/settings/discord-form";
import { recentSettingLogs, requireAdmin } from "@/server/admin";
import { prisma } from "@/server/db";
import { getSetting } from "@/server/settings";
import { appUrl, discordCasinoConfigured, discordRulesConfigured, env } from "@/server/env";
import { linkedRoleConfigured, rolesPanelConfigured } from "@/server/discord/roles-config";
import { discordAlertsConfigured } from "@/server/discord/alert-store";

/** Discord : modal « Rejoins notre Discord » (lien, textes, déclencheur, fréquence) et bonus de liaison. */
export default async function AdminDiscordPage() {
  await requireAdmin();
  const [t, values, logs, joined, casinoRules] = await Promise.all([
    getTranslations("admin.discord"),
    Promise.all(DISCORD_SETTING_KEYS.map((k) => getSetting(k))),
    recentSettingLogs(["discord."]),
    prisma.user.count({ where: { discordJoinedAt: { not: null } } }),
    getCasinoRules(),
  ]);
  const settings = Object.fromEntries(DISCORD_SETTING_KEYS.map((k, i) => [k, values[i]])) as DiscordSettings;
  const rulesPost = env.DISCORD_GUILD_ID && env.DISCORD_RULES_CHANNEL_ID
    ? await prisma.discordPost.findUnique({ where: { key: `rules:${env.DISCORD_GUILD_ID}:${env.DISCORD_RULES_CHANNEL_ID}` }, select: { messageId: true } })
    : null;
  const rulesUrl = rulesPost?.messageId ? `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${env.DISCORD_RULES_CHANNEL_ID}/${rulesPost.messageId}` : null;
  const rolesPost = env.DISCORD_GUILD_ID && env.DISCORD_ROLES_CHANNEL_ID
    ? await prisma.discordPost.findUnique({ where: { key: `roles:${env.DISCORD_GUILD_ID}:${env.DISCORD_ROLES_CHANNEL_ID}` }, select: { messageId: true } }) : null;
  const rolesUrl = rolesPost?.messageId ? `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${env.DISCORD_ROLES_CHANNEL_ID}/${rolesPost.messageId}` : null;
  const teaserPost = env.DISCORD_GUILD_ID && env.DISCORD_CASINO_CHANNEL_ID
    ? await prisma.discordPost.findUnique({ where: { key: `casino:teaser:${env.DISCORD_GUILD_ID}:${env.DISCORD_CASINO_CHANNEL_ID}` }, select: { messageId: true } }) : null;
  const teaserUrl = teaserPost?.messageId ? `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${env.DISCORD_CASINO_CHANNEL_ID}/${teaserPost.messageId}` : null;
  // Aperçu des annonces avec les vrais textes ; le gros lancer est un exemple
  const origin = appUrl();
  // Images servies par ce serveur (chemin relatif) : l'aperçu marche aussi avant la mise en production
  const previewOf = (label: string, m: ReturnType<typeof casinoTeaserMessage>) => {
    const image = m.embeds?.[0]?.image?.url;
    return { label, content: m.content ?? "", image: image ? new URL(image).pathname : null };
  };
  const casinoPreviews = [
    previewOf(t("casinoPreviewTeaser"), casinoTeaserMessage({ opensAt: casinoRules.opensAt === null ? null : new Date(casinoRules.opensAt), origin })),
    previewOf(t("casinoPreviewOpening"), casinoOpeningMessage({ origin, goal: null, reward: null })),
    previewOf(t("casinoPreviewFlip"), bigFlipMessage({ id: "exemple", winnerName: "Sora_ame", seal: "神", result: "OMOTE", card: { name: "Satoru Gojou", imageUrl: "", rarityName: "Mythique", spoiler: true } }, origin)),
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
        <p className="text-sm font-bold tabular-nums">{t("joinedCount", { count: joined })}</p>
      </div>
      <DiscordCommunityPanel configured={discordRulesConfigured} endpoint={`${appUrl()}/api/discord/interactions`} rulesUrl={rulesUrl} rolesConfigured={rolesPanelConfigured()} rolesUrl={rolesUrl} linkedConfigured={linkedRoleConfigured()} alertsConfigured={discordAlertsConfigured()} />
      <DiscordCasinoPanel configured={discordCasinoConfigured} teaserUrl={teaserUrl} previews={casinoPreviews} />
      <DiscordSettingsForm initial={settings} />
      <SettingLogList logs={logs} />
    </div>
  );
}
