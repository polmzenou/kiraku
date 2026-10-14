// Service worker de Kiraku : Web Push seulement (aucun cache hors ligne pour l'instant).
// Le texte arrive déjà rendu par le serveur, dans la langue du joueur : rien n'est écrit ici.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

/** Chemin interne seulement : un push ne mène jamais hors du site. */
function internalUrl(path) {
  try {
    const url = new URL(typeof path === "string" ? path : "/", self.location.origin);
    return url.origin === self.location.origin ? url.href : self.location.origin + "/";
  } catch {
    return self.location.origin + "/";
  }
}

self.addEventListener("push", (event) => {
  let data = null;
  try {
    data = event.data ? event.data.json() : null;
  } catch {
    data = null;
  }
  if (!data || typeof data.title !== "string" || typeof data.body !== "string") return;
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      renotify: typeof data.tag === "string",
      data: { url: internalUrl(data.url) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = internalUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target).catch(() => undefined);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
