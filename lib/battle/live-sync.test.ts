import { describe, expect, it } from "vitest";
import { claimDelay, deadlineDelay, MAX_CLAIM_ATTEMPTS, nextSkew, updateStep } from "./live-sync";

describe("mise à jour reçue en direct", () => {
  it("ignore ce qui est déjà affiché : notre propre action revenue par le temps réel, ou un doublon", () => {
    expect(updateStep(5, { from: 4, version: 5 })).toBe("ignore");
    expect(updateStep(5, { from: 3, version: 4 })).toBe("ignore");
  });

  it("joue une mise à jour qui part de la version affichée", () => {
    expect(updateStep(5, { from: 5, version: 6 })).toBe("apply");
    expect(updateStep(5, { from: 5, version: 8 })).toBe("apply");
  });

  it("rattrape depuis le journal quand un message a été manqué (ou qu'il part d'une version plus ancienne)", () => {
    expect(updateStep(5, { from: 6, version: 7 })).toBe("resync");
    expect(updateStep(5, { from: 4, version: 7 })).toBe("resync");
  });
});

describe("écart d'horloge avec le serveur", () => {
  it("prend la première mesure telle quelle", () => {
    expect(nextSkew(null, -2_500)).toBe(-2_500);
  });

  it("garde la mesure la plus haute : chacune est en retard du trajet de la réponse", () => {
    // Premier affichage : la vue a mis 3 s à arriver, puis un sondage mesure l'écart à 200 ms près
    let skew = nextSkew(null, -3_000);
    skew = nextSkew(skew, -200);
    expect(skew).toBe(-200);
    // Une réponse plus lente ne fait pas reculer l'estimation
    expect(nextSkew(skew, -900)).toBe(-200);
  });

  it("ne bouge pas pour moins d'un pas (aucun rendu du plateau pour du bruit)", () => {
    expect(nextSkew(1_000, 1_050)).toBe(1_000);
    expect(nextSkew(1_000, 1_100)).toBe(1_100);
  });

  it("ignore une mesure illisible", () => {
    expect(nextSkew(400, Number.NaN)).toBe(400);
    expect(nextSkew(Number.NaN, 300)).toBe(300);
  });
});

describe("échéance du tour", () => {
  const endsAt = "2026-11-26T12:00:30.000Z";
  const at = (iso: string) => Date.parse(iso);

  it("compte en heure du serveur : un appareil en avance de 20 s attend les vraies 30 s", () => {
    const deviceNow = at("2026-11-26T12:00:20.000Z"); // le serveur est à 12:00:00
    expect(deadlineDelay(endsAt, deviceNow, 0)).toBe(10_000);
    expect(deadlineDelay(endsAt, deviceNow, -20_000)).toBe(30_000);
  });

  it("un appareil en retard ne réclame pas après l'échéance", () => {
    const deviceNow = at("2026-11-26T11:59:50.000Z"); // le serveur est à 12:00:00
    expect(deadlineDelay(endsAt, deviceNow, 10_000)).toBe(30_000);
  });

  it("jamais négatif, et tout de suite pour une échéance illisible", () => {
    expect(deadlineDelay(endsAt, at("2026-11-26T12:05:00.000Z"), 0)).toBe(0);
    expect(deadlineDelay("pas une date", 0, 0)).toBe(0);
  });
});

describe("réclamation de la fin d'un tour échu", () => {
  it("attend une seconde au premier essai, puis espace les suivants", () => {
    expect(claimDelay(0)).toBe(1_000);
    expect(claimDelay(1)).toBe(2_000);
    expect(claimDelay(2)).toBe(4_000);
    expect(claimDelay(3)).toBe(8_000);
    expect(claimDelay(4)).toBe(8_000);
  });

  it("s'arrête après quelques essais : le sondage et le balayage du serveur prennent le relais", () => {
    expect(claimDelay(MAX_CLAIM_ATTEMPTS - 1)).not.toBeNull();
    expect(claimDelay(MAX_CLAIM_ATTEMPTS)).toBeNull();
  });
});
