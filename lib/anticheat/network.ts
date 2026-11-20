import { isDeviceId } from "./signals";

// Bans réseau (server/anticheat/network-ban.ts), partie pure : la clé comparable d'une IP ou d'un appareil, les
// plages qu'on ne bannit jamais, et les décisions de la fiche joueur, des groupes et du suivi d'un appareil.
//
// Une IPv4 se bannit à l'adresse exacte. Une IPv6 se bannit par son préfixe /64 : un téléphone ou une box change
// d'adresse à l'intérieur de ce préfixe (extensions de confidentialité), l'adresse exacte ne retiendrait personne.

export type NetworkKind = "IP" | "DEVICE";

/** Quatre octets d'une IPv4 écrite en décimal pointé, ou null. */
function parseIpv4(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p))) return null;
  const bytes = parts.map(Number);
  return bytes.every((b) => b <= 255) ? bytes : null;
}

/** Huit groupes de 16 bits d'une IPv6 (« :: », IPv4 finale et zone « %eth0 » acceptés), ou null. */
function parseIpv6(ip: string): number[] | null {
  const text = ip.split("%")[0].toLowerCase();
  if (text === "" || text.length > 45 || !/^[0-9a-f:.]+$/.test(text)) return null;
  const halves = text.split("::");
  if (halves.length > 2) return null;
  // Une IPv4 finale n'est permise qu'en toute fin d'adresse
  if (halves.length === 2 && halves[0].includes(".")) return null;
  const groups = (part: string): number[] | null => {
    if (part === "") return [];
    const items = part.split(":");
    const out: number[] = [];
    for (const [i, item] of items.entries()) {
      if (item.includes(".")) {
        const v4 = i === items.length - 1 ? parseIpv4(item) : null;
        if (!v4) return null;
        out.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
      } else if (/^[0-9a-f]{1,4}$/.test(item)) {
        out.push(parseInt(item, 16));
      } else {
        return null;
      }
    }
    return out;
  };
  const head = groups(halves[0]);
  const tail = halves.length === 2 ? groups(halves[1]) : [];
  if (!head || !tail) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const missing = 8 - head.length - tail.length;
  return missing >= 1 ? [...head, ...Array<number>(missing).fill(0), ...tail] : null;
}

type ParsedIp = { v4: number[] } | { v6: number[] };

function parseIp(ip: string): ParsedIp | null {
  const v4 = parseIpv4(ip);
  if (v4) return { v4 };
  const v6 = parseIpv6(ip);
  if (!v6) return null;
  // IPv4 encapsulée (::ffff:1.2.3.4, serveur en double pile) : c'est une IPv4
  if (v6.slice(0, 5).every((g) => g === 0) && v6[5] === 0xffff) return { v4: [v6[6] >> 8, v6[6] & 255, v6[7] >> 8, v6[7] & 255] };
  return { v6 };
}

/**
 * Clé de ban d'une IP : l'IPv4 exacte (« 86.245.12.3 »), ou le préfixe /64 d'une IPv6 (« 2a01:cb00:0:2::/64 »,
 * groupes en minuscules sans zéros de tête, jamais compressés). Deux écritures d'une même adresse donnent la même
 * clé. null si ce n'est pas une IP (« local » en développement).
 */
export function ipBanKey(ip: string): string | null {
  const parsed = parseIp(ip);
  if (!parsed) return null;
  if ("v4" in parsed) return parsed.v4.join(".");
  return `${parsed.v6.slice(0, 4).map((g) => g.toString(16)).join(":")}::/64`;
}

/** Plages IPv4 jamais bannies : [adresse de réseau, longueur du préfixe]. */
const RESERVED_V4: readonly (readonly [string, number])[] = [
  ["0.0.0.0", 8], // « ce réseau »
  ["10.0.0.0", 8], // privé
  ["100.64.0.0", 10], // CGNAT : une adresse d'opérateur partagée, jamais vue d'Internet
  ["127.0.0.0", 8], // boucle locale
  ["169.254.0.0", 16], // lien local
  ["172.16.0.0", 12], // privé
  ["192.0.0.0", 24],
  ["192.0.2.0", 24], // documentation
  ["192.168.0.0", 16], // privé
  ["198.18.0.0", 15], // bancs de test
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 3], // multidiffusion et réservé (224/4, 240/4)
];

const v4Number = (bytes: readonly number[]) => ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;

function isPublicV4(bytes: readonly number[]): boolean {
  const n = v4Number(bytes);
  return RESERVED_V4.every(([net, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (n & mask) >>> 0 !== (v4Number(parseIpv4(net)!) & mask) >>> 0;
  });
}

/**
 * Une IP qu'on peut bannir : publique. Une adresse privée, locale ou réservée vue côté serveur trahit un proxy mal
 * réglé (tout le monde paraîtrait venir d'elle) : on ne la bannit jamais.
 */
export function isBannableIp(ip: string): boolean {
  const parsed = parseIp(ip.replace(/::\/64$/, "::"));
  if (!parsed) return false;
  if ("v4" in parsed) return isPublicV4(parsed.v4);
  const [g0, g1] = parsed.v6;
  // Unicast global (2000::/3) seulement, hors documentation (2001:db8::/32)
  return (g0 & 0xe000) === 0x2000 && !(g0 === 0x2001 && g1 === 0xdb8);
}

/** Clé de ban d'un relevé (UserSignal) : clé d'IP, ou l'identifiant d'appareil tel quel. */
export function signalBanKey(kind: NetworkKind, value: string): string | null {
  if (kind === "DEVICE") return isDeviceId(value) ? value : null;
  return ipBanKey(value);
}

/**
 * Préfiltre SQL (LIKE) des relevés d'IP qui peuvent tomber sous une clé : l'IPv4 exacte (ou encapsulée, serveur en
 * double pile), ou le début de l'adresse pour une IPv6 (son premier groupe n'est jamais compressé ; le second ne
 * l'est que s'il vaut 0). La comparaison exacte des clés se fait ensuite avec ipBanKey.
 */
export function ipKeyPatterns(key: string): string[] {
  if (!key.endsWith("::/64")) return [key, `::ffff:${key}`];
  const [g0, g1] = key.split(":");
  return g1 === "0" ? [`${g0}:0:%`, `${g0}::%`] : [`${g0}:${g1}:%`];
}

/** État d'une IP ou d'un appareil au moment de le bannir. */
export type BanState =
  | "OK" // bannissable sans couper personne d'autre
  | "SHARED" // d'autres comptes actifs l'utilisent : les bannir les couperait aussi
  | "BANNED" // déjà banni
  | "STAFF" // un compte de l'équipe l'utilise : jamais (on ne s'exclut pas soi-même)
  | "PRIVATE" // IP privée, locale ou réservée
  | "CAP"; // IP vue sur plus de multiAccount.sharedIpCap comptes : réseau public ou opérateur

export type KeyFacts = {
  kind: NetworkKind;
  key: string;
  banned: boolean;
  staffSeen: boolean;
  /** Comptes distincts qui l'ont utilisée, tous confondus. */
  accounts: number;
  /** Comptes actifs (ni bannis ni anonymisés) qui l'ont utilisée, hors du ou des comptes visés. */
  othersActive: number;
};

/** État d'une clé : les refus d'abord (déjà banni, équipe, privée, trop partagée), puis le partage. */
export function banState(facts: KeyFacts, sharedIpCap: number): BanState {
  if (facts.banned) return "BANNED";
  if (facts.kind === "IP" && !isBannableIp(facts.key)) return "PRIVATE";
  if (facts.staffSeen) return "STAFF";
  if (facts.kind === "IP" && facts.accounts > sharedIpCap) return "CAP";
  return facts.othersActive > 0 ? "SHARED" : "OK";
}

/** Fiche joueur : une ligne se coche si elle est bannissable, et se précoche si elle ne coupe personne d'autre. */
export function selectionOf(state: BanState): { selectable: boolean; checked: boolean } {
  return { selectable: state === "OK" || state === "SHARED", checked: state === "OK" };
}

/** Le ban suit l'appareil : pourquoi la nouvelle IP d'un appareil banni est bannie à son tour, ou pas. */
export type FollowDecision = "FOLLOW" | "OFF" | "NOT_BANNABLE" | "STAFF" | "SHARED" | "LIMIT";

export function followDecision(input: {
  enabled: boolean;
  ipKey: string | null;
  staffSeen: boolean;
  /** Comptes actifs, hors comptes bannis, qui ont utilisé cette IP. */
  othersActive: number;
  maxOthers: number;
  /** IP déjà prises par ce ban d'appareil. */
  autoBans: number;
  perDevice: number;
}): FollowDecision {
  if (!input.enabled) return "OFF";
  if (!input.ipKey || !isBannableIp(input.ipKey)) return "NOT_BANNABLE";
  if (input.staffSeen) return "STAFF";
  if (input.autoBans >= input.perDevice) return "LIMIT";
  return input.othersActive > input.maxOthers ? "SHARED" : "FOLLOW";
}
