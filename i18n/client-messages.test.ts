import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CLIENT_NAMESPACES, pickClientMessages } from "./client-messages";

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? files(file) : /\.[jt]sx?$/.test(file) && !file.includes(".test.") ? [file] : [];
  });
}

describe("messages transmis aux composants client", () => {
  it("inclut les namespaces des composants client et des hooks partagés", () => {
    for (const file of [...files("components"), ...files("app"), ...files("lib")]) {
      const source = readFileSync(file, "utf8");
      if (!source.includes('"use client"') && !file.startsWith("lib")) continue;
      for (const match of source.matchAll(/useTranslations\(["']([^"']+)["']\)/g)) {
        const namespace = match[1].split(".")[0];
        if (namespace !== "admin") expect(CLIENT_NAMESPACES, `${file} : ${namespace}`).toContain(namespace);
      }
    }
  });

  it.each(["fr", "en"])("dispose de tous les textes retenus en %s, sans l'admin", (locale) => {
    const messages = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
    const client = pickClientMessages(messages);
    for (const namespace of CLIENT_NAMESPACES) expect(client[namespace], namespace).toBeDefined();
    expect(client.admin).toBeUndefined();
  });
});
