import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ create: vi.fn(), updateMany: vi.fn(), sendMail: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/i18n/navigation", () => ({ getPathname: () => "/verifier-email?token=x" }));
vi.mock("./db", () => ({ prisma: { authToken: { create: m.create, updateMany: m.updateMany } } }));
vi.mock("./env", () => ({ appUrl: () => "https://kiraku.test" }));
vi.mock("./mail", () => ({ sendMail: m.sendMail }));

import { sendPasswordResetEmail, sendVerificationEmail } from "./auth-emails";

beforeEach(() => {
  vi.clearAllMocks();
  m.create.mockResolvedValue({ id: "new-token", createdAt: new Date("2026-11-27T10:00:00.150Z") });
  m.updateMany.mockResolvedValue({ count: 1 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("liens envoyés par e-mail", () => {
  it("annule les anciens liens seulement après un envoi réussi, jamais le nouveau ni un plus récent", async () => {
    m.sendMail.mockResolvedValue(true);
    expect(await sendVerificationEmail("u1", "a@b.c", "fr")).toBe(true);
    // Strictement plus ancien : un lien créé au même instant par un autre envoi n'est pas annulé
    expect(m.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", type: "VERIFY_EMAIL", usedAt: null, createdAt: { lt: new Date("2026-11-27T10:00:00.150Z") } } }),
    );
  });

  it("un envoi raté laisse valide le lien précédent", async () => {
    m.sendMail.mockResolvedValue(false);
    expect(await sendPasswordResetEmail("u1", "a@b.c", "fr")).toBe(false);
    expect(m.updateMany).not.toHaveBeenCalled();
  });

  it("ne lève jamais, même si la base ou l'envoi lèvent", async () => {
    m.create.mockRejectedValue(new Error("base indisponible"));
    await expect(sendVerificationEmail("u1", "a@b.c", "fr")).resolves.toBe(false);
    m.create.mockResolvedValue({ id: "t" });
    m.sendMail.mockRejectedValue(new Error("inattendu"));
    await expect(sendPasswordResetEmail("u1", "a@b.c", "en")).resolves.toBe(false);
  });
});
