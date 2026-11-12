import { describe, expect, it } from "vitest";
import { anonymousPlayer, shownPlayer, shownPlayerRef } from "./shown-player";

const player = {
  username: "Sakura",
  image: "https://cdn.discordapp.com/avatars/1/a.png",
  frame: { frameStyle: "shu", active: true },
  nameColor: { nameColor: "kin", active: true },
};

describe("shownPlayer", () => {
  it("donne le lien et l'avatar quand le pseudo est affiché", () => {
    expect(shownPlayer("Sakura", player)).toMatchObject({ name: "Sakura", profile: "Sakura", image: player.image });
  });

  it("ne révèle rien quand le pseudo est remplacé par un libellé", () => {
    expect(shownPlayer("Joueur", player)).toEqual({ name: "Joueur", profile: null, image: null, color: null, frame: null });
  });

  it("accepte un nom calculé : visible comme une chaîne, révélé à l'admin avec un cadenas et rien d'autre", () => {
    expect(shownPlayer({ name: "Sakura", revealed: false }, player)).toMatchObject({ name: "Sakura", profile: "Sakura", image: player.image });
    expect(shownPlayer({ name: "Joueur", revealed: false }, player)).toEqual({ name: "Joueur", profile: null, image: null, color: null, frame: null });
    expect(shownPlayer({ name: "Sakura", revealed: true }, player)).toEqual({ name: "Sakura", profile: null, image: null, color: null, frame: null, locked: true });
  });

  it("ignore un cosmétique désactivé", () => {
    const shown = shownPlayer("Sakura", { ...player, frame: { frameStyle: "shu", active: false }, nameColor: null });
    expect(shown.frame).toBeNull();
    expect(shown.color).toBeNull();
  });
});

describe("shownPlayerRef", () => {
  it("garde le pseudo dans le lien quand le nom affiché diffère (invité)", () => {
    const ref = { username: "guest_ab12", image: null, decor: { frame: null, nameColor: null } };
    expect(shownPlayerRef("Invité AB12", ref)).toEqual({ name: "Invité AB12", profile: "guest_ab12", image: null, color: null, frame: null });
  });
});

describe("anonymousPlayer", () => {
  it("n'a ni lien ni image", () => {
    expect(anonymousPlayer("Joueur mystère")).toEqual({ name: "Joueur mystère", profile: null, image: null, color: null, frame: null });
  });
});
