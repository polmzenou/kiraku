import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CARD_IMAGE_LIMIT } from "@/lib/catalog/media";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), limit: vi.fn(), put: vi.fn(), log: vi.fn() }));
vi.mock("@vercel/blob", () => ({ put: mocks.put, del: async () => {} }));
vi.mock("@/server/admin", () => ({ getStaff: mocks.admin }));
vi.mock("@/server/ratelimit", () => ({ rateLimit: mocks.limit }));
vi.mock("@/server/db", () => ({ prisma: {} }));
vi.mock("@/server/admin/log", () => ({ writeAdminLog: mocks.log }));
import { POST } from "./route";

const origin = "https://kiraku.test";
const host = "test.public.blob.vercel-storage.com";
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
function request(bytes: Uint8Array = png, type = "image/png", source = origin) {
  const body = new FormData();
  body.set("file", new File([new Uint8Array(bytes)], "image.png", { type }));
  return new Request(`${origin}/api/admin/catalogue/upload`, { method: "POST", headers: { origin: source }, body });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-token"); vi.stubEnv("BLOB_PUBLIC_HOST", host);
  mocks.admin.mockResolvedValue({ user: { id: "admin" }, scope: "full" }); mocks.limit.mockResolvedValue({ success: true });
  mocks.put.mockResolvedValue({ url: `https://${host}/cards/unique.png`, pathname: "cards/unique.png" });
});
afterEach(() => vi.unstubAllEnvs());

describe("téléversement des images du catalogue", () => {
  it("refuse les visiteurs et les requêtes d’une autre origine", async () => {
    mocks.admin.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(403);
    mocks.admin.mockResolvedValue({ user: { id: "admin" }, scope: "full" });
    expect((await POST(request(png, "image/png", "https://other.test"))).status).toBe(403);
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it("accepte le rôle DEV, qui prépare des brouillons", async () => {
    mocks.admin.mockResolvedValue({ user: { id: "dev" }, scope: "drafts" });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.limit).toHaveBeenCalledWith("admin-upload:dev", expect.anything());
  });
  it("limite les envois avant toute écriture dans Blob", async () => {
    mocks.limit.mockResolvedValue({ success: false });
    expect((await POST(request())).status).toBe(429); expect(mocks.put).not.toHaveBeenCalled();
  });
  it("signale un stockage absent sans tenter un envoi", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    const response = await POST(request());
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: "STORAGE_UNAVAILABLE" });
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it("refuse les faux types d’image et les signatures incompatibles", async () => {
    expect((await POST(request(new TextEncoder().encode("<svg onload=alert(1) />")))).status).toBe(400);
    expect((await POST(request(png, "image/jpeg"))).status).toBe(400);
    expect((await POST(request(png, "image/svg+xml"))).status).toBe(400);
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it("borne aussi les requêtes sans Content-Length", async () => {
    const response = await POST(request(new Uint8Array(CARD_IMAGE_LIMIT + 30_000)));
    expect(response.status).toBe(413); expect(mocks.put).not.toHaveBeenCalled();
  });
  it("journalise un envoi réussi avec une URL unique dans le stockage configuré", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ url: `https://${host}/cards/unique.png` });
    expect(mocks.put).toHaveBeenCalledWith(expect.stringMatching(/^cards\/[\w-]+\.png$/), expect.any(Buffer), expect.objectContaining({ access: "public", addRandomSuffix: true, contentType: "image/png" }));
    expect(mocks.log).toHaveBeenCalledWith({}, expect.objectContaining({ adminId: "admin", action: "CARD_IMAGE_UPLOAD" }));
  });
  it("renvoie une erreur exploitable quand Blob échoue", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.put.mockRejectedValue(new Error("storage unavailable"));
      const response = await POST(request());
      expect(response.status).toBe(500); expect(await response.json()).toEqual({ error: "UPLOAD_FAILED" });
      expect(mocks.log).not.toHaveBeenCalled();
    } finally { consoleError.mockRestore(); }
  });
});
