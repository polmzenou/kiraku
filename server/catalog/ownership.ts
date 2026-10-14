import "server-only";
import { cache } from "react";
import { emptyWikiCollection } from "@/lib/catalog/wiki-state";
import { prisma } from "../db";
import { getCurrentUser } from "../user";
import { readWikiCollection } from "./ownership-core";

/** Only memoized within this render: private data never enters the public Next cache. */
export const getWikiCollection = cache(async () => {
  try {
    const user = await getCurrentUser();
    return user ? await readWikiCollection(prisma, user.id) : emptyWikiCollection();
  } catch (error) {
    console.error("[wiki] collection unavailable", error);
    return emptyWikiCollection(false);
  }
});
