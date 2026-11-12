import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscordUserAvatar } from "@/lib/discord/avatar";

vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({ prisma: {} }));
vi.mock("../env", () => ({ env: { DISCORD_BOT_TOKEN: "x" } }));
vi.mock("../settings", () => ({ getSetting: vi.fn() }));
const { DiscordApiError } = await import("./api");
const { syncAvatarsWith } = await import("./avatars");

const NOW = new Date("2026-11-13T12:00:00.000Z");
const HASH = "8342729096ea3675442027381ff50dfe";
const NEW_HASH = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const url = (id: string, hash: string) => `https://cdn.discordapp.com/avatars/${id}/${hash}.png`;

type Row = { providerAccountId: string; user: { id: string; image: string | null } };
function fakeDb(rows: Row[]) {
  const db = {
    account: { findMany: vi.fn(async ({ take }: { take: number }) => rows.slice(0, take)) },
    user: { update: vi.fn(async () => ({})) },
  };
  return db;
}
const opts = { hours: 24, activeDays: 14, batch: 10, deadline: Date.now() + 60_000, now: NOW };

beforeEach(() => vi.clearAllMocks());

describe("synchro des avatars Discord", () => {
  it("ne lit que les joueurs liés, actifs et pas relus depuis l'intervalle, les plus anciens d'abord", async () => {
    const db = fakeDb([]);
    await syncAvatarsWith(db as never, vi.fn(), opts);
    expect(db.account.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        provider: "discord",
        user: {
          anonymizedAt: null,
          lastSeenAt: { gt: new Date("2026-10-30T12:00:00.000Z") },
          OR: [{ avatarCheckedAt: null }, { avatarCheckedAt: { lt: new Date("2026-11-12T12:00:00.000Z") } }],
        },
      },
      orderBy: { user: { avatarCheckedAt: { sort: "asc", nulls: "first" } } },
      take: 10,
    }));
  });

  it("réécrit l'image seulement si l'avatar a changé, et note chaque joueur relu", async () => {
    const db = fakeDb([
      { providerAccountId: "111111111111", user: { id: "same", image: url("111111111111", HASH) } },
      { providerAccountId: "222222222222", user: { id: "changed", image: url("222222222222", HASH) } },
      { providerAccountId: "333333333333", user: { id: "none", image: null } },
    ]);
    const avatars: Record<string, DiscordUserAvatar> = {
      "111111111111": { id: "111111111111", avatar: HASH },
      "222222222222": { id: "222222222222", avatar: NEW_HASH },
      "333333333333": { id: "333333333333", avatar: HASH },
    };
    const result = await syncAvatarsWith(db as never, async (id) => avatars[id], opts);
    expect(result).toEqual({ checked: 3, updated: 2 });
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "same" }, data: { avatarCheckedAt: NOW } });
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "changed" }, data: { avatarCheckedAt: NOW, image: url("222222222222", NEW_HASH) } });
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "none" }, data: { avatarCheckedAt: NOW, image: url("333333333333", HASH) } });
  });

  it("note relu un compte Discord supprimé sans toucher à l'image, et s'arrête net sur une limite ou une panne", async () => {
    const db = fakeDb([
      { providerAccountId: "111111111111", user: { id: "gone", image: url("111111111111", HASH) } },
      { providerAccountId: "222222222222", user: { id: "limited", image: null } },
      { providerAccountId: "333333333333", user: { id: "later", image: null } },
    ]);
    const fetchUser = vi.fn(async (id: string): Promise<DiscordUserAvatar> => {
      throw new DiscordApiError(id === "111111111111" ? 404 : 429, 1000);
    });
    expect(await syncAvatarsWith(db as never, fetchUser, opts)).toEqual({ checked: 1, updated: 0 });
    expect(db.user.update).toHaveBeenCalledExactlyOnceWith({ where: { id: "gone" }, data: { avatarCheckedAt: NOW } });
    expect(fetchUser).toHaveBeenCalledTimes(2);
  });

  it("n'appelle jamais Discord avec un identifiant douteux, ni quand la synchro est coupée", async () => {
    const db = fakeDb([{ providerAccountId: "../guilds/1", user: { id: "odd", image: null } }]);
    const fetchUser = vi.fn();
    expect(await syncAvatarsWith(db as never, fetchUser, opts)).toEqual({ checked: 1, updated: 0 });
    expect(fetchUser).not.toHaveBeenCalled();
    expect(await syncAvatarsWith(db as never, fetchUser, { ...opts, hours: 0 })).toEqual({ checked: 0, updated: 0 });
    expect(db.account.findMany).toHaveBeenCalledTimes(1);
  });
});
