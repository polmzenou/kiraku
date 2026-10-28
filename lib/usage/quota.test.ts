import { describe, expect, it } from "vitest";
import { alertThresholdsSchema, DEFAULT_ALERT_THRESHOLDS, estimateEgressGb, quotaAlerts, quotaLevel, usageShare } from "./quota";

const t = DEFAULT_ALERT_THRESHOLDS;

describe("niveaux d'alerte de consommation", () => {
  it("passe à l'orange à 70 % pile et au rouge à 90 % pile", () => {
    expect(quotaLevel(0.6999, t)).toBe("ok");
    expect(quotaLevel(0.7, t)).toBe("warn");
    expect(quotaLevel(0.8999, t)).toBe("warn");
    expect(quotaLevel(0.9, t)).toBe("critical");
    expect(quotaLevel(1.4, t)).toBe("critical");
  });

  it("une mesure indisponible n'alerte pas et ne casse rien", () => {
    expect(quotaLevel(null, t)).toBe("unknown");
    expect(quotaLevel(Number.NaN, t)).toBe("unknown");
    expect(usageShare(null, 500)).toBeNull();
    expect(usageShare(100, 0)).toBeNull();
    expect(usageShare(250, 500)).toBe(0.5);
  });

  it("suit des seuils réglés dans /admin", () => {
    expect(quotaLevel(0.5, { warnPercent: 40, criticalPercent: 60 })).toBe("warn");
    expect(quotaLevel(0.6, { warnPercent: 40, criticalPercent: 60 })).toBe("critical");
  });

  it("refuse des seuils inversés ou égaux", () => {
    expect(alertThresholdsSchema.safeParse({ warnPercent: 90, criticalPercent: 70 }).success).toBe(false);
    expect(alertThresholdsSchema.safeParse({ warnPercent: 80, criticalPercent: 80 }).success).toBe(false);
    expect(alertThresholdsSchema.safeParse(t).success).toBe(true);
  });

  it("liste les mesures en alerte, la plus chargée d'abord, avec le pire niveau", () => {
    const res = quotaAlerts(
      [
        { key: "db", share: 0.75 },
        { key: "egress", share: 0.95 },
        { key: "storage", share: 0.1 },
        { key: "connections", share: null },
      ],
      t,
    );
    expect(res.worst).toBe("critical");
    expect(res.alerts.map((a) => a.key)).toEqual(["egress", "db"]);
    expect(quotaAlerts([{ key: "db", share: 0.2 }], t).worst).toBeNull();
    expect(quotaAlerts([{ key: "db", share: 0.71 }], t).worst).toBe("warn");
  });

  it("estime l'egress à partir des invocations", () => {
    expect(estimateEgressGb(1_000_000, 5)).toBe(5);
    expect(estimateEgressGb(-1, 5)).toBe(0);
  });
});
