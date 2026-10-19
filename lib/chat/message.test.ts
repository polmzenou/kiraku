import { describe, expect, it } from "vitest";
import { cleanChatBody, unreadBadge } from "./message";

describe("texte d'un message", () => {
  it("garde le texte et les sauts de ligne simples", () => {
    expect(cleanChatBody("  Salut !\nTu as Gojo ?  ", 500)).toBe("Salut !\nTu as Gojo ?");
  });

  it("retire les caractères de contrôle et d'orientation", () => {
    expect(cleanChatBody(`a${String.fromCharCode(0)}b${String.fromCharCode(0x202e)}c${String.fromCharCode(0x200b)}d`, 500)).toBe("abcd");
  });

  it("limite les lignes vides et normalise les fins de ligne", () => {
    expect(cleanChatBody("a\r\n\r\n\r\n\r\nb", 500)).toBe("a\n\nb");
  });

  it("refuse un message vide ou trop long", () => {
    expect(cleanChatBody("   \n ", 500)).toBeNull();
    expect(cleanChatBody("x".repeat(21), 20)).toBeNull();
    expect(cleanChatBody("<b>hé</b>", 500)).toBe("<b>hé</b>"); // affiché en texte, jamais en HTML
  });
});

describe("badge de non-lus", () => {
  it("affiche le nombre, plafonné à 9+", () => {
    expect(unreadBadge(0)).toBeNull();
    expect(unreadBadge(3)).toBe("3");
    expect(unreadBadge(12)).toBe("9+");
  });
});
