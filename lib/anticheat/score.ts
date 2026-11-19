// Détection des multi-comptes : on relie des paires de comptes par des indices pondérés, puis on regroupe
// (union-find) les paires dont le score atteint le seuil. Fonction pure : le serveur lit les données
// (server/anticheat/queries.ts), ce module décide. Un score élevé est un soupçon à vérifier, pas une preuve.

import { emailStem, normalizeEmail, textStem } from "./email";

export const REASON_WEIGHTS = {
  device: 60, // même cookie appareil : même navigateur
  emailAlias: 50, // même boîte de réception (alias +, points Gmail)
  ip: 30, // même IP, partagée par peu de comptes
  emailStem: 30, // même racine d'e-mail (paulmehr, paul.mehr68)
  flow: 20, // valeur qui va presque toujours dans le même sens
  referral: 15, // l'un a parrainé l'autre
  createdClose: 10, // comptes créés à quelques minutes d'écart (20 avec une IP commune)
  usernameStem: 10, // même racine de pseudo
  onlyFriend: 10, // l'un est le seul ami de l'autre
  interactions: 10, // nombreux échanges entre eux, sans sens dominant
} as const;

export type ReasonKind = keyof typeof REASON_WEIGHTS;

export const CREATED_CLOSE_MINUTES = 15;
const FLOW_MIN = 3; // transferts orientés minimum pour juger d'un sens
const FLOW_SHARE = 0.8; // part d'un sens pour le dire dominant
const INTERACTIONS_MIN = 5;

export type Reason =
  | { kind: "device"; count: number }
  | { kind: "ip"; values: string[] }
  | { kind: "emailAlias" }
  | { kind: "emailStem"; stem: string }
  | { kind: "usernameStem"; stem: string }
  | { kind: "flow"; fromId: string; toId: string; gifts: number; sales: number; flips: number }
  | { kind: "interactions"; total: number }
  | { kind: "referral"; referrerId: string }
  | { kind: "createdClose"; minutes: number; withIp: boolean }
  | { kind: "onlyFriend"; userIds: string[] };

export type TransferKind = "gift" | "sale" | "flip" | "swap";

export type DetectionInput = {
  users: readonly { id: string; username: string; email: string | null; createdAt: Date }[];
  signals: readonly { userId: string; kind: "IP" | "DEVICE"; value: string }[];
  referrals: readonly { referrerId: string; refereeId: string }[];
  /** Joueurs qui n'ont qu'un ami accepté, et lequel */
  onlyFriends: readonly { userId: string; friendId: string }[];
  /** Transferts agrégés : de fromId vers toId (pour « swap », sens sans importance) */
  transfers: readonly { fromId: string; toId: string; kind: TransferKind; count: number }[];
  /** Au-delà de ce nombre de comptes, une IP ou une racine est jugée commune et ne relie plus */
  sharedCap: number;
  minScore: number;
};

export type SuspectPair = { a: string; b: string; score: number; reasons: Reason[] };
export type SuspectCluster = { score: number; userIds: string[]; pairs: SuspectPair[] };

export function reasonWeight(reason: Reason): number {
  if (reason.kind === "createdClose" && reason.withIp) return REASON_WEIGHTS.createdClose * 2;
  return REASON_WEIGHTS[reason.kind];
}

const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);

type Draft = { a: string; b: string; reasons: Map<ReasonKind, Reason>; flow: { ab: { gift: number; sale: number; flip: number }; ba: { gift: number; sale: number; flip: number }; swaps: number } };

class PairBook {
  readonly drafts = new Map<string, Draft>();
  get(x: string, y: string): Draft {
    const key = pairKey(x, y);
    let draft = this.drafts.get(key);
    if (!draft) {
      const [a, b] = x < y ? [x, y] : [y, x];
      draft = { a, b, reasons: new Map(), flow: { ab: { gift: 0, sale: 0, flip: 0 }, ba: { gift: 0, sale: 0, flip: 0 }, swaps: 0 } };
      this.drafts.set(key, draft);
    }
    return draft;
  }
}

/** Groupes « même valeur » : chaque paire du groupe reçoit l'indice, si le groupe n'est pas trop commun. */
function linkGroups(book: PairBook, groups: Map<string, Set<string>>, cap: number, add: (draft: Draft, key: string) => void) {
  for (const [key, members] of groups) {
    if (members.size < 2 || members.size > cap) continue;
    const ids = [...members].sort();
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) add(book.get(ids[i], ids[j]), key);
  }
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string | null, id: (row: T) => string) {
  const groups = new Map<string, Set<string>>();
  for (const row of rows) {
    const k = key(row);
    if (!k) continue;
    const set = groups.get(k) ?? new Set<string>();
    set.add(id(row));
    groups.set(k, set);
  }
  return groups;
}

/** Toutes les paires reliées par au moins un indice, avec leur score. */
export function scorePairs(input: DetectionInput): SuspectPair[] {
  const book = new PairBook();
  const cap = input.sharedCap;
  // Seuls les comptes de `users` comptent (invités et comptes anonymisés écartés par l'appelant)
  const known = new Set(input.users.map((u) => u.id));
  const isKnown = (...ids: string[]) => ids.every((id) => known.has(id));

  // Appareils et IP
  const signals = input.signals.filter((s) => isKnown(s.userId));
  const devices = groupBy(signals.filter((s) => s.kind === "DEVICE"), (s) => s.value, (s) => s.userId);
  linkGroups(book, devices, cap, (d) => {
    const prev = d.reasons.get("device");
    d.reasons.set("device", { kind: "device", count: (prev?.kind === "device" ? prev.count : 0) + 1 });
  });
  const ips = groupBy(signals.filter((s) => s.kind === "IP"), (s) => s.value, (s) => s.userId);
  linkGroups(book, ips, cap, (d, ip) => {
    const prev = d.reasons.get("ip");
    d.reasons.set("ip", { kind: "ip", values: [...(prev?.kind === "ip" ? prev.values : []), ip] });
  });

  // E-mails et pseudos
  const aliases = groupBy(input.users, (u) => normalizeEmail(u.email), (u) => u.id);
  linkGroups(book, aliases, cap, (d) => d.reasons.set("emailAlias", { kind: "emailAlias" }));
  const emailStems = groupBy(input.users, (u) => emailStem(u.email), (u) => u.id);
  linkGroups(book, emailStems, cap, (d, stem) => {
    if (!d.reasons.has("emailAlias")) d.reasons.set("emailStem", { kind: "emailStem", stem });
  });
  const nameStems = groupBy(input.users, (u) => textStem(u.username), (u) => u.id);
  linkGroups(book, nameStems, cap, (d, stem) => d.reasons.set("usernameStem", { kind: "usernameStem", stem }));

  // Parrainage et ami unique
  for (const r of input.referrals) {
    if (r.referrerId !== r.refereeId && isKnown(r.referrerId, r.refereeId)) book.get(r.referrerId, r.refereeId).reasons.set("referral", { kind: "referral", referrerId: r.referrerId });
  }
  for (const o of input.onlyFriends) {
    if (o.userId === o.friendId || !isKnown(o.userId, o.friendId)) continue;
    const d = book.get(o.userId, o.friendId);
    const prev = d.reasons.get("onlyFriend");
    const userIds = [...(prev?.kind === "onlyFriend" ? prev.userIds : []), o.userId];
    d.reasons.set("onlyFriend", { kind: "onlyFriend", userIds });
  }

  // Transferts
  for (const t of input.transfers) {
    if (t.fromId === t.toId || t.count <= 0 || !isKnown(t.fromId, t.toId)) continue;
    const d = book.get(t.fromId, t.toId);
    if (t.kind === "swap") {
      d.flow.swaps += t.count;
      continue;
    }
    const side = t.fromId === d.a ? d.flow.ab : d.flow.ba;
    side[t.kind] += t.count;
  }
  const users = new Map(input.users.map((u) => [u.id, u]));
  const pairs: SuspectPair[] = [];
  for (const d of book.drafts.values()) {
    const ab = d.flow.ab.gift + d.flow.ab.sale + d.flow.ab.flip;
    const ba = d.flow.ba.gift + d.flow.ba.sale + d.flow.ba.flip;
    const directed = ab + ba;
    if (directed >= FLOW_MIN && Math.max(ab, ba) >= FLOW_SHARE * directed) {
      const [fromId, toId, side] = ab >= ba ? [d.a, d.b, d.flow.ab] : [d.b, d.a, d.flow.ba];
      d.reasons.set("flow", { kind: "flow", fromId, toId, gifts: side.gift, sales: side.sale, flips: side.flip });
    } else if (directed + d.flow.swaps >= INTERACTIONS_MIN) {
      d.reasons.set("interactions", { kind: "interactions", total: directed + d.flow.swaps });
    }

    // Création rapprochée : n'ajoute qu'à une paire déjà reliée par autre chose
    const ua = users.get(d.a);
    const ub = users.get(d.b);
    if (d.reasons.size > 0 && ua && ub) {
      const minutes = Math.abs(ua.createdAt.getTime() - ub.createdAt.getTime()) / 60_000;
      if (minutes <= CREATED_CLOSE_MINUTES) d.reasons.set("createdClose", { kind: "createdClose", minutes: Math.round(minutes), withIp: d.reasons.has("ip") });
    }

    if (d.reasons.size === 0) continue;
    const reasons = [...d.reasons.values()].sort((x, y) => reasonWeight(y) - reasonWeight(x));
    pairs.push({ a: d.a, b: d.b, score: reasons.reduce((sum, r) => sum + reasonWeight(r), 0), reasons });
  }
  return pairs.sort((x, y) => y.score - x.score);
}

/** Groupes de comptes reliés par des paires au-dessus du seuil, les plus suspects d'abord. */
export function detectClusters(input: DetectionInput, pairs: SuspectPair[] = scorePairs(input)): SuspectCluster[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let node = x;
    while (node !== root) {
      const next = parent.get(node)!;
      parent.set(node, root);
      node = next;
    }
    return root;
  };
  const strong = pairs.filter((p) => p.score >= input.minScore);
  for (const p of strong) {
    if (!parent.has(p.a)) parent.set(p.a, p.a);
    if (!parent.has(p.b)) parent.set(p.b, p.b);
    const [ra, rb] = [find(p.a), find(p.b)];
    if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
  }
  const clusters = new Map<string, SuspectCluster>();
  for (const id of parent.keys()) {
    const root = find(id);
    const cluster = clusters.get(root) ?? { score: 0, userIds: [], pairs: [] };
    cluster.userIds.push(id);
    clusters.set(root, cluster);
  }
  // Toutes les paires internes au groupe, même faibles : elles complètent le tableau
  for (const p of pairs) {
    if (!parent.has(p.a) || !parent.has(p.b)) continue;
    const root = find(p.a);
    if (root !== find(p.b)) continue;
    const cluster = clusters.get(root)!;
    cluster.pairs.push(p);
    cluster.score = Math.max(cluster.score, p.score);
  }
  return [...clusters.values()]
    .map((c) => ({ ...c, userIds: c.userIds.sort() }))
    .sort((x, y) => y.score - x.score || y.userIds.length - x.userIds.length);
}
