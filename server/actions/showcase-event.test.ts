import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  admin: vi.fn(),
  state: vi.fn(),
  limit: vi.fn(),
  setting: vi.fn(),
  enter: vi.fn(),
  withdraw: vi.fn(),
  vote: vi.fn(),
  clear: vi.fn(),
  remove: vi.fn(),
  refresh: vi.fn(),
  tag: vi.fn(),
}));
vi.mock("next/cache", () => ({ refresh: mocks.refresh, updateTag: mocks.tag }));
vi.mock("../user", () => ({ getCurrentUser: mocks.user }));
vi.mock("../admin", () => ({ getAdmin: mocks.admin }));
vi.mock("../db", () => ({ prisma: {} }));
vi.mock("../ratelimit", () => ({ rateLimit: mocks.limit }));
vi.mock("../settings", () => ({ getSetting: mocks.setting }));
vi.mock("../event/showcase-queries", () => ({ getShowcaseEventState: mocks.state, SHOWCASE_EVENT_TAG: "showcase-event" }));
vi.mock("../event/showcase-core", () => ({
  enterShowcaseEventWith: mocks.enter,
  withdrawShowcaseEntryWith: mocks.withdraw,
  voteShowcaseEntryWith: mocks.vote,
  clearShowcaseVoteWith: mocks.clear,
  removeShowcaseEntryByAdminWith: mocks.remove,
  ShowcaseEventError: class extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  },
}));

import { ShowcaseEventError } from "../event/showcase-core";
import {
  clearShowcaseVoteAction,
  enterShowcaseEventAction,
  removeShowcaseEntryAction,
  voteShowcaseEntryAction,
  withdrawShowcaseEntryAction,
} from "./showcase-event";

const player = { id: "joueur", isGuest: false, bannedAt: null, deletionRequestedAt: null, anonymizedAt: null };
const live = { enabled: true, edition: "vitrines-1", startsAt: "", endsAt: "", phase: "live", minCards: 2, pageSize: 10 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue(player);
  mocks.state.mockResolvedValue(live);
  mocks.limit.mockResolvedValue({ success: true });
  mocks.setting.mockResolvedValue({});
  mocks.admin.mockResolvedValue({ id: "admin" });
});

describe("actions de l'event vitrines", () => {
  it("refuse sans session, aux invités, aux comptes bannis ou gelés, sans rien écrire", async () => {
    mocks.user.mockResolvedValueOnce(null);
    expect(await voteShowcaseEntryAction({ entryId: "e1" })).toEqual({ ok: false, error: "NO_SESSION" });
    mocks.user.mockResolvedValueOnce({ ...player, isGuest: true });
    expect(await voteShowcaseEntryAction({ entryId: "e1" })).toEqual({ ok: false, error: "GUEST" });
    mocks.user.mockResolvedValueOnce({ ...player, bannedAt: new Date() });
    expect(await enterShowcaseEventAction({ showcaseId: "s1" })).toEqual({ ok: false, error: "UNAVAILABLE" });
    mocks.user.mockResolvedValueOnce({ ...player, deletionRequestedAt: new Date() });
    expect(await withdrawShowcaseEntryAction({})).toEqual({ ok: false, error: "UNAVAILABLE" });
    expect(mocks.vote).not.toHaveBeenCalled();
    expect(mocks.enter).not.toHaveBeenCalled();
    expect(mocks.withdraw).not.toHaveBeenCalled();
  });

  it("valide les entrées avec Zod", async () => {
    expect(await voteShowcaseEntryAction({ entryId: "../x" })).toEqual({ ok: false, error: "INVALID" });
    expect(await voteShowcaseEntryAction({ entryId: "e1", voterId: "autre" })).toEqual({ ok: false, error: "INVALID" });
    expect(await withdrawShowcaseEntryAction({ userId: "autre" })).toEqual({ ok: false, error: "INVALID" });
    expect(mocks.vote).not.toHaveBeenCalled();
  });

  it("refuse tout quand l'event est caché, à venir ou terminé", async () => {
    for (const state of [{ ...live, enabled: false }, { ...live, phase: "upcoming" }, { ...live, phase: "ended" }, { ...live, phase: null }]) {
      mocks.state.mockResolvedValueOnce(state);
      expect(await voteShowcaseEntryAction({ entryId: "e1" })).toEqual({ ok: false, error: "CLOSED" });
    }
    expect(mocks.vote).not.toHaveBeenCalled();
  });

  it("respecte la limitation de débit", async () => {
    mocks.limit.mockResolvedValue({ success: false });
    expect(await voteShowcaseEntryAction({ entryId: "e1" })).toEqual({ ok: false, error: "RATE_LIMITED" });
    expect(mocks.vote).not.toHaveBeenCalled();
  });

  it("transmet au cœur l'édition et les règles décidées par le serveur", async () => {
    expect(await enterShowcaseEventAction({ showcaseId: "s1" })).toEqual({ ok: true });
    expect(mocks.enter).toHaveBeenCalledWith({}, { userId: "joueur", showcaseId: "s1", edition: "vitrines-1", minCards: 2, themes: {} });
    expect(await voteShowcaseEntryAction({ entryId: "e1" })).toEqual({ ok: true });
    expect(mocks.vote).toHaveBeenCalledWith({}, { voterId: "joueur", edition: "vitrines-1", entryId: "e1", enabled: true, phase: "live" });
    expect(await clearShowcaseVoteAction({})).toEqual({ ok: true });
    expect(mocks.clear).toHaveBeenCalledWith({}, { voterId: "joueur", edition: "vitrines-1" });
    expect(mocks.refresh).toHaveBeenCalledTimes(3);
  });

  it("relaie les refus du cœur (vote pour soi, inscription en double)", async () => {
    mocks.vote.mockRejectedValueOnce(new ShowcaseEventError("OWN_ENTRY"));
    expect(await voteShowcaseEntryAction({ entryId: "e1" })).toEqual({ ok: false, error: "OWN_ENTRY" });
    mocks.enter.mockRejectedValueOnce(new ShowcaseEventError("ALREADY_ENTERED"));
    expect(await enterShowcaseEventAction({ showcaseId: "s1" })).toEqual({ ok: false, error: "ALREADY_ENTERED" });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("modération : admin seulement, journalisée par le cœur, résultats invalidés", async () => {
    mocks.admin.mockResolvedValueOnce(null);
    expect(await removeShowcaseEntryAction({ entryId: "e1" })).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(await removeShowcaseEntryAction({ entryId: "e1" })).toEqual({ ok: true });
    expect(mocks.remove).toHaveBeenCalledWith({}, { adminId: "admin", entryId: "e1" });
    expect(mocks.tag).toHaveBeenCalledWith("showcase-event");
  });
});
