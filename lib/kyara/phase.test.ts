import { describe, expect, it } from "vitest";
import { playerKyaraPhase, showKyaraBanner, showKyaraTile } from "./phase";
import type { KyaraEligibility } from "./window";

const OPEN: KyaraEligibility = { ok: true, deadline: 1_000 };
const closed = (reason: Exclude<KyaraEligibility, { ok: true }>["reason"]): KyaraEligibility => ({ ok: false, reason, deadline: 1_000, opensAt: 500 });

describe("ce que voit le joueur", () => {
  it("une demande en cours ou versée reste visible, même coupé ou hors fenêtre", () => {
    expect(playerKyaraPhase(closed("DISABLED"), { status: "PENDING", rejectCode: null }, false)).toEqual({ kind: "PENDING" });
    expect(playerKyaraPhase(closed("EXPIRED"), { status: "READY", rejectCode: null }, false)).toEqual({ kind: "READY" });
    expect(playerKyaraPhase(closed("DISABLED"), { status: "DONE", rejectCode: null }, true)).toEqual({ kind: "DONE" });
  });

  it("après un refus, une nouvelle demande n'est possible que dans la fenêtre", () => {
    expect(playerKyaraPhase(OPEN, { status: "REJECTED", rejectCode: "NOT_FRIEND" }, false)).toEqual({ kind: "REJECTED", code: "NOT_FRIEND", canRetry: true, deadline: 1_000 });
    expect(playerKyaraPhase(closed("EXPIRED"), { status: "REJECTED", rejectCode: "OTHER" }, false)).toMatchObject({ kind: "REJECTED", canRetry: false });
    expect(playerKyaraPhase(OPEN, { status: "REJECTED", rejectCode: null }, true)).toMatchObject({ canRetry: false });
  });

  it("sans demande (ou annulée) : ouvert, ou la raison", () => {
    expect(playerKyaraPhase(OPEN, null, false)).toEqual({ kind: "OPEN", deadline: 1_000 });
    expect(playerKyaraPhase(OPEN, { status: "CANCELLED", rejectCode: null }, false)).toEqual({ kind: "OPEN", deadline: 1_000 });
    expect(playerKyaraPhase(OPEN, null, true)).toEqual({ kind: "CLOSED", reason: "DISCORD_USED", deadline: 1_000 });
    expect(playerKyaraPhase(closed("DISABLED"), null, false)).toEqual({ kind: "HIDDEN" });
    expect(playerKyaraPhase(closed("NOT_LAUNCHED"), null, false)).toEqual({ kind: "SOON", opensAt: 500 });
    expect(playerKyaraPhase(closed("GUEST"), null, false)).toEqual({ kind: "GUEST" });
    expect(playerKyaraPhase(closed("NO_DISCORD"), null, false)).toEqual({ kind: "CLOSED", reason: "NO_DISCORD", deadline: 1_000 });
  });

  it("bannière quand le joueur peut agir, tuile tant qu'il y a quelque chose à faire ou à relire", () => {
    expect(showKyaraBanner({ kind: "OPEN", deadline: 1 })).toBe(true);
    expect(showKyaraBanner({ kind: "GUEST" })).toBe(true);
    expect(showKyaraBanner({ kind: "CLOSED", reason: "NO_DISCORD", deadline: 1 })).toBe(true);
    expect(showKyaraBanner({ kind: "CLOSED", reason: "EXPIRED", deadline: 1 })).toBe(false);
    expect(showKyaraBanner({ kind: "PENDING" })).toBe(false);
    expect(showKyaraTile({ kind: "DONE" })).toBe(true);
    expect(showKyaraTile({ kind: "PENDING" })).toBe(true);
    expect(showKyaraTile({ kind: "GUEST" })).toBe(false);
    expect(showKyaraTile({ kind: "CLOSED", reason: "EXPIRED", deadline: 1 })).toBe(false);
    expect(showKyaraTile({ kind: "SOON", opensAt: null })).toBe(false);
  });
});
