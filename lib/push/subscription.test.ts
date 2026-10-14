import { describe, expect, it } from "vitest";
import { isExpiredPush, isPushServiceUrl, pushSubscriptionSchema, safePushPath } from "./subscription";

const keys = { p256dh: "B".repeat(87), auth: "a".repeat(22) };

describe("isPushServiceUrl", () => {
  it("accepte les services push des navigateurs", () => {
    for (const url of [
      "https://fcm.googleapis.com/fcm/send/abc:def",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAA",
      "https://wns2-par02p.notify.windows.com/w/?token=x",
      "https://web.push.apple.com/QGx",
    ]) {
      expect(isPushServiceUrl(url), url).toBe(true);
    }
  });

  it("refuse tout autre hôte, http, port ou identifiants", () => {
    for (const url of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com.evil.test/x",
      "https://evil.test/fcm.googleapis.com",
      "https://localhost/push",
      "https://169.254.169.254/latest",
      "https://user:pw@fcm.googleapis.com/x",
      "https://fcm.googleapis.com:8443/x",
      "pas une url",
    ]) {
      expect(isPushServiceUrl(url), url).toBe(false);
    }
  });
});

describe("pushSubscriptionSchema", () => {
  it("valide un abonnement réel", () => {
    expect(pushSubscriptionSchema.safeParse({ endpoint: "https://fcm.googleapis.com/fcm/send/abc:def", keys }).success).toBe(true);
  });

  it("borne les clés et l'endpoint", () => {
    const endpoint = "https://fcm.googleapis.com/fcm/send/abc";
    expect(pushSubscriptionSchema.safeParse({ endpoint, keys: { ...keys, p256dh: "B".repeat(500) } }).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse({ endpoint, keys: { ...keys, auth: "a<b>".repeat(6) } }).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse({ endpoint: `${endpoint}/${"x".repeat(1100)}`, keys }).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse({ endpoint }).success).toBe(false);
  });
});

describe("isExpiredPush", () => {
  it("404 et 410 suppriment l'abonnement, pas les erreurs passagères", () => {
    expect(isExpiredPush(410)).toBe(true);
    expect(isExpiredPush(404)).toBe(true);
    expect(isExpiredPush(429)).toBe(false);
    expect(isExpiredPush(500)).toBe(false);
    expect(isExpiredPush(undefined)).toBe(false);
  });
});

describe("safePushPath", () => {
  it("garde les chemins internes seulement", () => {
    expect(safePushPath("/en/amis?onglet=demandes")).toBe("/en/amis?onglet=demandes");
    expect(safePushPath("//evil.test")).toBe("/");
    expect(safePushPath("https://evil.test")).toBe("/");
  });
});
