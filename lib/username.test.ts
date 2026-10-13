import { describe, expect, it } from "vitest";
import { guestCode, guestUsername, sanitizeUsername, USERNAME_REGEX } from "./username";

describe("USERNAME_REGEX", () => {
  it.each(["abc", "Kata_99", "a-b-c", "x".repeat(20)])("accepte %s", (name) => {
    expect(USERNAME_REGEX.test(name)).toBe(true);
  });

  it.each(["ab", "x".repeat(21), "Invité", "a b", "<script>", ""])("refuse %s", (name) => {
    expect(USERNAME_REGEX.test(name)).toBe(false);
  });
});

describe("guestUsername", () => {
  it("forme guest- suivi de 6 caractères hexadécimaux majuscules", () => {
    const name = guestUsername(new Uint8Array([0x3a, 0x04, 0x6f]));
    expect(name).toBe("guest-3A046F");
    expect(USERNAME_REGEX.test(name)).toBe(true);
  });

  it("extrait le code affiché", () => {
    expect(guestCode("guest-3A046F")).toBe("3A046F");
    expect(guestCode("Kata")).toBeNull();
  });
});

describe("sanitizeUsername", () => {
  it("retire les caractères interdits et coupe à 20", () => {
    expect(sanitizeUsername("Kata ✿ San")).toBe("KataSan");
    expect(sanitizeUsername("a".repeat(30))).toBe("a".repeat(20));
  });

  it("renvoie null si le résultat est trop court", () => {
    expect(sanitizeUsername("✿✿")).toBeNull();
    expect(sanitizeUsername(null)).toBeNull();
  });
});
