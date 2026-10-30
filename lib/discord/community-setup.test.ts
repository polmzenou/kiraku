import { describe, expect, it } from "vitest";
import { gettingStartedMessage } from "./getting-started";
import { autoModRules } from "./automod";

describe("guide et AutoMod Kiraku", () => {
  it("publie un guide dans les limites Discord avec les bons liens et sans mention générale", () => {
    const guide = gettingStartedMessage("https://kiraku-kun.com");
    expect(guide.embeds![0].description!.length).toBeLessThanOrEqual(4096);
    expect(guide.embeds![0].description).toContain("<#1565779037429825616>");
    expect(guide.components![0].components.map((item) => item.url)).toEqual(["https://kiraku-kun.com", "https://kiraku-kun.com/compte", "https://kiraku-kun.com/marche"]);
    expect(guide.allowed_mentions).toEqual({ parse: [] });
  });
  it("prépare spam, mentions, insultes et invitations, avec blocage et alerte seulement", () => {
    const rules = autoModRules("alerts", ["staff"]);
    expect(rules).toHaveLength(4);
    expect(rules.every((rule) => rule.enabled && rule.actions.every((action) => [1, 2].includes(action.type)))).toBe(true);
    expect(rules.find((rule) => rule.trigger_type === 5)!.trigger_metadata).toMatchObject({ mention_total_limit: 5, mention_raid_protection_enabled: true });
    expect(rules.every((rule) => rule.exempt_roles.join() === "staff" && rule.actions.some((action) => action.type === 2 && action.metadata.channel_id === "alerts"))).toBe(true);
    for (const rule of rules) {
      expect(rule.trigger_metadata?.keyword_filter?.every((word) => word.length <= 60) ?? true).toBe(true);
      for (const action of rule.actions) if (action.type === 1 && action.metadata) expect(action.metadata.custom_message.length).toBeLessThanOrEqual(150);
    }
  });
});
