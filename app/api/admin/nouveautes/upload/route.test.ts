import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CARD_IMAGE_LIMIT } from "@/lib/catalog/media";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), limit: vi.fn(), put: vi.fn(), del: vi.fn(), log: vi.fn() }));
vi.mock("@vercel/blob", () => ({ put: mocks.put, del: mocks.del }));
vi.mock("@/server/admin", () => ({ getAdmin: mocks.admin }));
vi.mock("@/server/ratelimit", () => ({ rateLimit: mocks.limit }));
vi.mock("@/server/db", () => ({ prisma: {} }));
vi.mock("@/server/admin/log", () => ({ writeAdminLog: mocks.log }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/env", () => ({ appUrl: () => "https://kiraku-kun.com" }));
// Le vrai binaire est lent à charger quand toute la suite tourne : un sharp qui refuse ces faux octets
vi.mock("sharp", () => ({
  default: () => {
    throw new Error("Input buffer contains unsupported image format");
  },
}));
import { POST } from "./route";

const origin = "https://kiraku.test";
const host = "test.public.blob.vercel-storage.com";
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
function request(bytes: Uint8Array = png, type = "image/png", source = origin) {
  const body = new FormData();
  body.set("file", new File([new Uint8Array(bytes)], "banniere.png", { type }));
  return new Request(`${origin}/api/admin/nouveautes/upload`, { method: "POST", headers: { origin: source }, body });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-token");
  vi.stubEnv("BLOB_PUBLIC_HOST", host);
  mocks.admin.mockResolvedValue({ id: "admin", role: "ADMIN" });
  mocks.limit.mockResolvedValue({ success: true });
  mocks.put.mockResolvedValue({ url: `https://${host}/news/unique.png`, pathname: "news/unique.png" });
  mocks.del.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("téléversement des images de bannière Nouveautés", () => {
  it("refuse tout sauf un admin complet, et les autres origines", async () => {
    mocks.admin.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(403);
    mocks.admin.mockResolvedValue({ id: "admin", role: "ADMIN" });
    expect((await POST(request(png, "image/png", "https://other.test"))).status).toBe(403);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("limite les envois et signale un stockage absent sans rien écrire", async () => {
    mocks.limit.mockResolvedValueOnce({ success: false });
    expect((await POST(request())).status).toBe(429);
    vi.stubEnv("BLOB_PUBLIC_HOST", "");
    expect((await POST(request())).status).toBe(503);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("refuse les faux types, les signatures incompatibles et les fichiers trop lourds", async () => {
    expect((await POST(request(new TextEncoder().encode("<svg onload=alert(1) />"), "image/png"))).status).toBe(400);
    expect((await POST(request(png, "image/jpeg"))).status).toBe(400);
    expect((await POST(request(png, "image/svg+xml"))).status).toBe(400);
    expect((await POST(request(new Uint8Array(CARD_IMAGE_LIMIT + 30_000)))).status).toBe(413);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("range l'image sous news/ et journalise l'envoi", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: `https://${host}/news/unique.png` });
    expect(mocks.put).toHaveBeenCalledWith(expect.stringMatching(/^news\/[\w-]+\.png$/), expect.any(Buffer), expect.objectContaining({ access: "public", addRandomSuffix: true, token: "test-token" }));
    expect(mocks.log).toHaveBeenCalledWith({}, expect.objectContaining({ adminId: "admin", action: "NEWS_IMAGE_UPLOAD", targetType: "NewsImage" }));
  });

  it("n'accepte pas une adresse rendue hors du dossier des bannières, et retire l'image sans trace", async () => {
    mocks.put.mockResolvedValueOnce({ url: `https://${host}/cards/unique.png`, pathname: "cards/unique.png" });
    expect((await POST(request())).status).toBe(503);
    mocks.log.mockRejectedValueOnce(new Error("journal indisponible"));
    expect((await POST(request())).status).toBe(500);
    expect(mocks.del).toHaveBeenCalledWith(`https://${host}/news/unique.png`, { token: "test-token" });
  });
});
