// Règles de robots.txt (production). Les moteurs de recherche gardent le wiki et les pages publiques ;
// les robots d'entraînement et d'assistants d'IA n'apportent pas de joueurs et coûtent des rendus
// serveur : ils sont refusés partout.

export const AI_CRAWLERS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  "CCBot",
  "Bytespider",
  "Amazonbot",
  "meta-externalagent",
  "Meta-ExternalFetcher",
  "FacebookBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "cohere-ai",
  "Diffbot",
  "Timpibot",
  "ImagesiftBot",
  "YouBot",
  "omgili",
  "PetalBot",
] as const;

// Pages privées ou propres à un joueur, et variantes à paramètres d'une même page : filtres du wiki
// (un espace de crawl sans fin) et versions archivées des pages légales
const PRIVATE = ["/api/", "/admin/", "/compte", "/collection", "/tirage/"];
const VARIANTS = ["/wiki?", "/*?v="];
// Images de partage (lib/seo/open-graph.ts) : leur adresse porte aussi « ?v=N » (version du dessin). Sans cette
// exception, « /*?v= » les fermait à tous les robots, dont Twitterbot et LinkedInBot qui suivent robots.txt : les
// liens partagés sur X s'affichaient sans image. La règle la plus longue l'emporte (/og-image contre /*?v=).
const SHARE_IMAGES = ["/og-image"];

function localized(paths: readonly string[]): string[] {
  return paths.flatMap((p) => (p.startsWith("/*") ? [p] : [p, `/en${p}`]));
}

export type RobotsRule = { userAgent: string | string[]; allow?: string | string[]; disallow: string | string[] };

export function productionRobotsRules(): RobotsRule[] {
  return [
    { userAgent: [...AI_CRAWLERS], disallow: "/" },
    { userAgent: "*", allow: ["/", ...localized(SHARE_IMAGES)], disallow: [...localized(PRIVATE), ...localized(VARIANTS)] },
  ];
}
