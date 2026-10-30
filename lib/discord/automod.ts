export type AutoModRulePlan = {
  name: string; event_type: 1; trigger_type: 1 | 3 | 5;
  trigger_metadata?: { keyword_filter?: string[]; mention_total_limit?: number; mention_raid_protection_enabled?: boolean };
  actions: Array<{ type: 1; metadata?: { custom_message: string } } | { type: 2; metadata: { channel_id: string } }>;
  enabled: true; exempt_roles: string[]; exempt_channels: string[];
};

/** Blocage et alerte, sans bannissement ni exclusion automatique. */
export function autoModRules(alertChannelId: string, staffRoleIds: string[]): AutoModRulePlan[] {
  const actions: AutoModRulePlan["actions"] = [{ type: 1 }, { type: 2, metadata: { channel_id: alertChannelId } }];
  const base = { event_type: 1 as const, enabled: true as const, exempt_roles: staffRoleIds.slice(0, 20), exempt_channels: [] };
  return [
    { ...base, name: "Kiraku · Spam", trigger_type: 3, actions },
    { ...base, name: "Kiraku · Mentions massives", trigger_type: 5, trigger_metadata: { mention_total_limit: 5, mention_raid_protection_enabled: true }, actions },
    { ...base, name: "Kiraku · Insultes et propos haineux", trigger_type: 1,
      trigger_metadata: { keyword_filter: ["fdp", "ntm", "nique ta mère", "nique ta mere", "fils de pute", "sale arabe", "sale noir", "sale juif", "sale pd", "sale pédé", "sale pede", "bougnoule", "youpin", "nègre", "negro", "négro"] },
      actions: [{ type: 1, metadata: { custom_message: "Les insultes et propos haineux n’ont pas leur place sur Kiraku. Reformule ton message." } }, actions[1]],
    },
    { ...base, name: "Kiraku · Invitations publicitaires", trigger_type: 1,
      trigger_metadata: { keyword_filter: ["*discord.gg/*", "*discord.com/invite/*", "*discordapp.com/invite/*"] },
      actions: [{ type: 1, metadata: { custom_message: "La publicité et les invitations Discord nécessitent l’accord de l’équipe." } }, actions[1]],
    },
  ];
}
