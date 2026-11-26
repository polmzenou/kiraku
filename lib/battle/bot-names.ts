// Noms des bots de secours, sans le moteur : le serveur en tire un au sort, l'interface dessine son masque.

export const BOT_NAMES = ["TENGU", "KITSUNE", "KAPPA", "TANUKI", "ONI", "KARASU", "YUREI", "RONIN"] as const;

export type BotName = (typeof BOT_NAMES)[number];

export const isBotName = (name: string | null | undefined): name is BotName => (BOT_NAMES as readonly string[]).includes(name ?? "");
