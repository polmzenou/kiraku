import { z } from "zod";

// Avant la construction des schémas client : même le test de disponibilité de new Function
// déclenche une violation CSP. Le serveur conserve sa compilation rapide.
if (typeof window !== "undefined") z.config({ jitless: true });

export * from "zod";
