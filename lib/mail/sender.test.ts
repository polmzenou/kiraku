import { describe, expect, it } from "vitest";
import { isResendTestSender, senderDomain } from "./sender";

describe("expéditeur des e-mails", () => {
  it("lit le domaine avec ou sans nom affiché", () => {
    expect(senderDomain("Kiraku <noreply@kiraku-kun.com>")).toBe("kiraku-kun.com");
    expect(senderDomain("noreply@Kiraku-Kun.com")).toBe("kiraku-kun.com");
    expect(senderDomain("  Kiraku   <noreply@send.kiraku-kun.com>  ")).toBe("send.kiraku-kun.com");
  });

  it("renvoie null pour une valeur absente ou illisible", () => {
    expect(senderDomain(undefined)).toBeNull();
    expect(senderDomain("")).toBeNull();
    expect(senderDomain("Kiraku")).toBeNull();
    expect(senderDomain("Kiraku <pas-une-adresse>")).toBeNull();
  });

  it("repère l'expéditeur de test de Resend", () => {
    expect(isResendTestSender("Kiraku <onboarding@resend.dev>")).toBe(true);
    expect(isResendTestSender("Kiraku <noreply@kiraku-kun.com>")).toBe(false);
    expect(isResendTestSender(undefined)).toBe(false);
  });
});
