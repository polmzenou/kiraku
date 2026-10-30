import { getLocale } from "next-intl/server";
import { cookies } from "next/headers";
import { isCollapsed, localizeNews, NEWS_COOKIE } from "@/lib/home/news";
import { resolveNewsVisuals } from "@/server/home/news";
import { getSetting } from "@/server/settings";
import { requireActiveUser } from "@/server/user";
import { getDiscordVote } from "@/server/welcome";
import { NewsPanelView } from "./NewsPanelView";

/**
 * Encart « Nouveautés » en haut de l'accueil (réglé dans /admin/nouveautes) : les visuels des bannières
 * (cartes, boosters) sont lus en base et mis en cache ; réduit selon le cookie du joueur. Un joueur
 * connecté y trouve d'abord le sondage Discord, avec sa réponse s'il a déjà voté.
 */
export async function NewsPanel() {
  const [config, locale, jar, user] = await Promise.all([getSetting("home.news"), getLocale(), cookies(), requireActiveUser()]);
  if (!config.enabled || config.items.length === 0) return null;
  const [visuals, vote] = await Promise.all([resolveNewsVisuals(config.items, locale), user ? getDiscordVote(user.id) : null]);
  const news = localizeNews(config, locale, visuals);
  if (!news) return null;
  return (
    <NewsPanelView
      news={news}
      initialCollapsed={isCollapsed(jar.get(NEWS_COOKIE)?.value, news.revision)}
      poll={user ? { vote } : null}
    />
  );
}
