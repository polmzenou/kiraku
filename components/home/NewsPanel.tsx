import { getLocale } from "next-intl/server";
import { cookies } from "next/headers";
import { isCollapsed, localizeNews, NEWS_COOKIE } from "@/lib/home/news";
import { getSetting } from "@/server/settings";
import { NewsPanelView } from "./NewsPanelView";

/** Encart « Nouveautés » en haut de l'accueil (réglé dans /admin/nouveautes), réduit selon le cookie du joueur. */
export async function NewsPanel() {
  const [config, locale, jar] = await Promise.all([getSetting("home.news"), getLocale(), cookies()]);
  const news = localizeNews(config, locale);
  if (!news) return null;
  return <NewsPanelView news={news} initialCollapsed={isCollapsed(jar.get(NEWS_COOKIE)?.value, news.revision)} />;
}
