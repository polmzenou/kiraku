import { describe, expect, it } from "vitest";
import { ageText, ambassadorDecisionMessage, clueText, decisionMessage, grandPayoutMessage, holdMessage, milestonePayoutMessage, stepPayoutMessage, trustPayoutMessage, type FeedReferral } from "./referral-feed";

const origin = "https://kiraku.example";
const base: FeedReferral = {
  referralId: "ref_1",
  referee: { name: "Léa_*x*", accountDays: 3, via: "DISCORD", discordDays: 800, trust: "HIGH", openings: 22, activeDays: 3 },
  referrer: { name: "Tristren", installed: 4, milestones: 2, received: { zeni: 3000, boosters: 25, vouchers: 1 } },
  pair: { sharedDevice: false, sharedIp: true, score: 34 },
};
const fieldsOf = (m: ReturnType<typeof stepPayoutMessage>) => Object.fromEntries((m.embeds?.[0].fields ?? []).map((f) => [f.name, f.value]));
const json = (m: unknown) => JSON.stringify(m);

describe("ageText", () => {
  it("dit l'âge d'un compte en mots", () => {
    expect(ageText(0.4)).toBe("moins d'un jour");
    expect(ageText(1)).toBe("1 jour");
    expect(ageText(12)).toBe("12 jours");
    expect(ageText(65)).toBe("2 mois");
    expect(ageText(800)).toBe("2 ans");
  });
});

describe("clueText", () => {
  it("dit l'indice et son poids, sans adresse IP ni e-mail", () => {
    expect(clueText({ kind: "device", count: 1 })).toBe("Même appareil +60");
    const ip = clueText({ kind: "ip", values: ["203.0.113.7", "198.51.100.2"] });
    expect(ip).toMatch(/^IP communes \(2\) \+\d+$/);
    expect(ip).not.toContain("203.0.113.7");
    expect(clueText({ kind: "emailStem", stem: "tristan" })).not.toContain("tristan");
    expect(clueText({ kind: "createdClose", minutes: 12, withIp: true })).toBe("Comptes créés à 12 min d'écart, même IP +20");
  });
});

describe("fil du parrainage (salon privé de l'équipe)", () => {
  it("une étape versée : les deux côtés, l'Ennichi, les stats et la paire, le lien vers la fiche", () => {
    const m = stepPayoutMessage({ ...base, step: 2, toReferee: "2 boosters Mythique · 2 000 Zeni", toReferrer: "2 boosters Jūbako", trustKept: false, multiplier: 2 }, origin);
    const embed = m.embeds![0];
    expect(embed.title).toBe("二 Étape 2 · Installé · Léa\\_\\*x\\* → Tristren");
    expect(embed.description).toBe("**Léa\\_\\*x\\*** est installé.");
    expect(embed.url).toBe("https://kiraku.example/admin/parrainage/suivi/ref_1");
    const fields = fieldsOf(m);
    expect(fields["Versé au filleul (Léa\\_\\*x\\*)"]).toBe("2 boosters Mythique · 2 000 Zeni");
    expect(fields["Ennichi"]).toBe("oui · ×2");
    expect(fields["Paire"]).toBe("appareil commun : non · IP commune : oui · score 34");
    expect(fields["Léa\\_\\*x\\*"]).toBe("compte de 3 jours · Discord (compte de 2 ans) · confiance haute");
    expect(fields["Tristren"]).toBe("4 amis installés · 2 paliers · reçu : 3 000 Zeni, 25 boosters, 1 bon");
    expect(m.components?.[0].components[0]).toMatchObject({ style: 5, url: embed.url });
    expect(m.allowed_mentions).toEqual({ parse: [] });
  });

  it("note la part « confiance » gardée pour l'étape 3 quand le filleul n'a pas de Discord ancien", () => {
    const m = stepPayoutMessage({ ...base, referee: { ...base.referee, via: "EMAIL", discordDays: null, trust: "MEDIUM" }, step: 1, toReferee: null, toReferrer: "5 boosters Tout anime", trustKept: true, multiplier: 1 }, origin);
    const fields = fieldsOf(m);
    expect(fields["Versé au parrain (Tristren)"]).toBe("5 boosters Tout anime · part « confiance » gardée pour l'étape 3");
    expect(fields["Versé au filleul (Léa\\_\\*x\\*)"]).toBe("rien");
    expect(fields["Léa\\_\\*x\\*"]).toContain("e-mail seul · confiance moyenne");
  });

  it("n'envoie jamais d'adresse IP : seulement oui ou non", () => {
    const all = [
      stepPayoutMessage({ ...base, step: 3, toReferee: null, toReferrer: null, trustKept: false, multiplier: 1 }, origin),
      trustPayoutMessage({ ...base, step: 1, toReferrer: "1 booster Mythique" }, origin),
      holdMessage({ ...base, reason: "DEVICE", clues: ["Même appareil +60"], threshold: 60, waitingSteps: [1, 2] }, origin),
    ];
    for (const m of all) expect(json(m)).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
  });

  it("met « À vérifier » en avant avec son motif et ce qui attend", () => {
    const m = holdMessage({ ...base, reason: "SCORE", clues: [], threshold: 60, waitingSteps: [1] }, origin);
    const fields = fieldsOf(m);
    expect(m.embeds![0].title).toContain("À vérifier");
    expect(fields["Motif"]).toBe("score de la paire");
    expect(fields["En attente"]).toBe("étape 1, rien versé");
    expect(fields["Indices"]).toBe("aucun autre");
    expect(m.components?.[0].components.map((c) => c.label)).toEqual(["Ouvrir dans l'admin", "Voir la file"]);
  });

  it("palier, grand-parrainage et décisions", () => {
    const palier = milestonePayoutMessage({ referralId: null, referrer: base.referrer, milestone: 5, reward: null, extras: ["1 Mythique au choix"] }, origin);
    expect(palier.embeds![0].title).toBe("階 Palier de 5 amis · Tristren");
    expect(fieldsOf(palier)["Versé à Tristren"]).toBe("1 Mythique au choix");
    expect(palier.embeds![0].url).toBe("https://kiraku.example/admin/parrainage/suivi");

    const grand = grandPayoutMessage({ referralId: "ref_2", referee: "Hugo", referrer: "Léa", grand: "Papi", reward: "1 booster divin" }, origin);
    expect(grand.embeds![0].description).toBe("Le filleul de Léa (Hugo) est installé.");

    const ban = decisionMessage({ referralId: "ref_1", referee: "Max", referrer: "Tristren", decision: "BANNED", by: "Staff", reason: "même appareil", taken: "300 Zeni · 2 boosters" }, origin);
    expect(ban.embeds![0].title).toBe("決 Révoqué et banni · Max → Tristren");
    expect(fieldsOf(ban)).toMatchObject({ Raison: "même appareil", Repris: "300 Zeni · 2 boosters" });
    const ok = decisionMessage({ referralId: "ref_1", referee: "Max", referrer: "Tristren", decision: "VALIDATED", by: "Staff", reason: null, taken: null }, origin);
    expect(fieldsOf(ok)).toEqual({ Suite: "Tout ce qui était dû est versé." });

    // Ambassadeur proposé par le palier : décision de l'équipe, lien vers la fiche du joueur
    const yes = ambassadorDecisionMessage({ userId: "u_1", name: "Tristren", installed: 25, accepted: true, by: "Staff" }, origin);
    expect(yes.embeds![0].title).toBe("使 Ambassadeur accepté · Tristren");
    expect(yes.embeds![0].url).toBe("https://kiraku.example/admin/utilisateurs/u_1");
    expect(fieldsOf(yes).Parrainage).toBe("25 amis installés à la proposition");
    const no = ambassadorDecisionMessage({ userId: "u_1", name: "Tristren", installed: 26, accepted: false, by: "Staff" }, origin);
    expect(no.embeds![0].title).toBe("使 Ambassadeur refusé · Tristren");
    expect(fieldsOf(no).Suite).toBe("La proposition est fermée, le joueur garde ses lots.");
    expect(no.allowed_mentions).toEqual({ parse: [] });
  });
});
