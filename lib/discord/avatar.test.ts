import { describe, expect, it } from "vitest";
import { discordAvatarUrl, isDiscordId } from "./avatar";

const ID = "80351110224678912";
const HASH = "8342729096ea3675442027381ff50dfe";

describe("avatar Discord", () => {
  it("donne la même adresse qu'Auth.js : PNG, ou GIF pour un avatar animé", () => {
    expect(discordAvatarUrl({ id: ID, avatar: HASH })).toBe(`https://cdn.discordapp.com/avatars/${ID}/${HASH}.png`);
    expect(discordAvatarUrl({ id: ID, avatar: `a_${HASH}` })).toBe(`https://cdn.discordapp.com/avatars/${ID}/a_${HASH}.gif`);
  });

  it("retombe sur l'avatar par défaut de Discord, nouveau ou ancien format de pseudo", () => {
    expect(discordAvatarUrl({ id: ID, avatar: null, discriminator: "0" })).toBe(`https://cdn.discordapp.com/embed/avatars/${Number((BigInt(ID) >> 22n) % 6n)}.png`);
    expect(discordAvatarUrl({ id: ID, avatar: null })).toMatch(/^https:\/\/cdn\.discordapp\.com\/embed\/avatars\/[0-5]\.png$/);
    expect(discordAvatarUrl({ id: ID, avatar: null, discriminator: "1337" })).toBe("https://cdn.discordapp.com/embed/avatars/2.png");
  });

  it("refuse une réponse inattendue plutôt que d'écrire une adresse douteuse", () => {
    expect(discordAvatarUrl({ id: "../channels/1", avatar: HASH })).toBeNull();
    expect(discordAvatarUrl({ id: ID, avatar: "../../evil" })).toBeNull();
    expect(discordAvatarUrl({ id: ID, avatar: null, discriminator: "abc" })).toBeNull();
    expect(isDiscordId(ID)).toBe(true);
    expect(isDiscordId("12a")).toBe(false);
  });
});
