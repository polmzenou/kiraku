// Textes légaux de départ (version 1, publiée) : prisma/seed/legal/{slug}.{fr,en}.md.
// Idempotent : un slug qui a déjà au moins une version en base n'est jamais touché, les textes
// se modifient ensuite depuis /admin/legal.
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "../../generated/prisma/client.ts";
import { LEGAL_LOCALES, LEGAL_SLUGS } from "../../lib/legal/legal.ts";

/** Sépare le titre (première ligne « # … ») du corps. */
export function splitTitle(markdown: string): { title: string; body: string } {
  const text = markdown.replace(/\r\n/g, "\n").trim();
  const match = /^#\s+(.+)\n+/.exec(text);
  if (!match) return { title: "", body: text };
  return { title: match[1].trim(), body: text.slice(match[0].length).trim() };
}

export async function upsertLegalSeeds(prisma: PrismaClient, dir = path.join(import.meta.dirname, "legal")) {
  const created: string[] = [];
  for (const slug of LEGAL_SLUGS) {
    if ((await prisma.legalPage.count({ where: { slug } })) > 0) continue;
    const now = new Date();
    for (const locale of LEGAL_LOCALES) {
      const { title, body } = splitTitle(await readFile(path.join(dir, `${slug}.${locale}.md`), "utf8"));
      await prisma.legalPage.create({
        data: { slug, locale, version: 1, title, body, status: "PUBLISHED", publishedAt: now },
      });
    }
    created.push(slug);
  }
  return created;
}
