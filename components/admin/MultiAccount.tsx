import { getFormatter, getTranslations } from "next-intl/server";
import { ResponsiveTable } from "@/components/admin/ResponsiveTable";
import { Link } from "@/i18n/navigation";
import { maskEmail, maskIp, shortDevice } from "@/lib/anticheat/mask";
import { reasonWeight, type Reason, type SuspectPair } from "@/lib/anticheat/score";
import type { MemberInfo, SignalRow } from "@/server/anticheat/queries";

// Blocs de la détection des multi-comptes (page /admin/multi-comptes et fiche joueur). Composants serveur :
// `masked` (DEV) masque IP et e-mails ici, avant le rendu ; rien de brut ne part vers le navigateur.

const userLink = "font-bold text-link underline underline-offset-4";

function name(members: Map<string, MemberInfo>, id: string) {
  return members.get(id)?.username ?? id;
}

/** Badge de score : rouge au-dessus de 100, or au-dessus de 60. */
export function ScoreBadge({ score, label }: { score: number; label: string }) {
  const tone = score >= 100 ? "border-shu bg-shu/15 text-shu" : score >= 60 ? "border-kin bg-kin/15 text-kin" : "border-border bg-surface-2 text-text-muted";
  return <span className={`inline-flex min-h-7 items-center rounded-pill border px-3 text-sm font-bold tabular-nums ${tone}`}>{label}</span>;
}

/** Puces des indices d'une paire, avec leur poids. */
export async function ReasonChips({ reasons, members, masked }: { reasons: readonly Reason[]; members: Map<string, MemberInfo>; masked: boolean }) {
  const t = await getTranslations("admin.multiAccounts.reasons");
  const text = (r: Reason): string => {
    switch (r.kind) {
      case "device":
        return t("device", { count: r.count });
      case "ip":
        return t("ip", { count: r.values.length, ips: r.values.map((v) => (masked ? maskIp(v) : v)).join(", ") });
      case "emailAlias":
        return t("emailAlias");
      case "emailStem":
        return t("emailStem", { stem: masked ? `${r.stem.slice(0, 2)}***` : r.stem });
      case "usernameStem":
        return t("usernameStem", { stem: r.stem });
      case "flow":
        return t("flow", {
          from: name(members, r.fromId),
          to: name(members, r.toId),
          items: [
            r.gifts > 0 ? t("flowGifts", { count: r.gifts }) : null,
            r.sales > 0 ? t("flowSales", { count: r.sales }) : null,
            r.flips > 0 ? t("flowFlips", { count: r.flips }) : null,
          ].filter(Boolean).join(", "),
        });
      case "interactions":
        return t("interactions", { count: r.total });
      case "referral":
        return t("referral", { referrer: name(members, r.referrerId) });
      case "createdClose":
        return t(r.withIp ? "createdCloseIp" : "createdClose", { minutes: r.minutes });
      case "onlyFriend":
        return t("onlyFriend", { names: r.userIds.map((id) => name(members, id)).join(", ") });
    }
  };
  return (
    <ul className="flex flex-wrap gap-2">
      {reasons.map((r) => (
        <li key={r.kind} className="inline-flex items-center gap-2 rounded-pill border border-border bg-surface-2 px-3 py-1 text-xs">
          <span>{text(r)}</span>
          <span className="font-bold tabular-nums text-text-muted">+{reasonWeight(r)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Tableau des comptes d'un groupe. */
export async function MemberTable({ ids, members, masked, caption }: { ids: readonly string[]; members: Map<string, MemberInfo>; masked: boolean; caption: string }) {
  const [t, users, format] = await Promise.all([getTranslations("admin.multiAccounts"), getTranslations("admin.users"), getFormatter()]);
  const rows = ids.flatMap((id) => members.get(id) ?? []);
  return (
    <ResponsiveTable
      caption={caption}
      columns={[
        { key: "player", label: users("player"), primary: true },
        { key: "status", label: users("status") },
        { key: "created", label: users("created"), className: "whitespace-nowrap" },
        { key: "seen", label: t("lastSeen"), className: "whitespace-nowrap" },
        { key: "coins", label: users("coins"), className: "tabular-nums text-kin" },
        { key: "cards", label: users("cards"), className: "tabular-nums" },
      ]}
      rows={rows.map((m) => ({
        id: m.id,
        cells: {
          player: (
            <span className="flex flex-col">
              <Link href={`/admin/utilisateurs/${m.id}`} className={userLink}>{m.username}</Link>
              <span className="text-xs break-all text-text-muted">{m.email ? (masked ? maskEmail(m.email) : m.email) : users("noEmail")}</span>
            </span>
          ),
          status: (
            <span className="flex flex-col text-xs">
              <span className={m.banned ? "font-bold text-shu" : ""}>
                {users(m.banned ? "banned" : m.role === "ADMIN" ? "adminRole" : m.role === "DEV" ? "devRole" : m.isGuest ? "guest" : "registered")}
              </span>
              {m.discordLinked && <span className="text-text-muted">{t("discord")}</span>}
            </span>
          ),
          created: format.dateTime(m.createdAt, { dateStyle: "short", timeStyle: "short" }),
          seen: m.lastSeenAt ? format.relativeTime(m.lastSeenAt) : "—",
          coins: format.number(m.coins),
          cards: format.number(m.cards),
        },
      }))}
    />
  );
}

/** Paires reliées (de la plus suspecte à la moins suspecte), avec leurs indices. */
export async function PairList({ pairs, members, masked, minScore, focus }: { pairs: readonly SuspectPair[]; members: Map<string, MemberInfo>; masked: boolean; minScore: number; focus?: string }) {
  const t = await getTranslations("admin.multiAccounts");
  return (
    <ul className="flex flex-col gap-3">
      {pairs.map((p) => {
        const ids = focus ? [p.a === focus ? p.b : p.a] : [p.a, p.b];
        return (
          <li key={`${p.a}|${p.b}`} className="flex flex-col gap-2 rounded-control border border-border p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {ids.map((id, i) => (
                <span key={id} className="flex items-center gap-2">
                  {i > 0 && <span aria-hidden="true" className="text-text-muted">↔</span>}
                  <Link href={`/admin/utilisateurs/${id}`} className={userLink}>{name(members, id)}</Link>
                </span>
              ))}
              <ScoreBadge score={p.score} label={t("score", { score: p.score })} />
              {p.score < minScore && <span className="text-xs text-text-muted">{t("belowThreshold")}</span>}
            </div>
            <ReasonChips reasons={p.reasons} members={members} masked={masked} />
          </li>
        );
      })}
    </ul>
  );
}

/** IP et appareils d'un joueur, avec les autres comptes qui les partagent. */
export async function SignalTable({ rows, masked }: { rows: readonly SignalRow[]; masked: boolean }) {
  const [t, format] = await Promise.all([getTranslations("admin.multiAccounts"), getFormatter()]);
  return (
    <ResponsiveTable
      caption={t("signalsTitle")}
      columns={[
        { key: "value", label: t("signalValue"), primary: true },
        { key: "event", label: t("firstEvent") },
        { key: "first", label: t("firstSeen"), className: "whitespace-nowrap" },
        { key: "last", label: t("lastSeenSignal"), className: "whitespace-nowrap" },
        { key: "others", label: t("otherAccounts"), className: "min-w-36" },
      ]}
      rows={rows.map((s, i) => ({
        id: `signal-${i}`, // jamais la valeur en clé : elle partirait en clair dans la charge RSC du DEV
        cells: {
          value: (
            <span className="flex flex-col">
              <span className="text-xs text-text-muted">{t(`kinds.${s.kind}`)}</span>
              <span className="break-all tabular-nums">{s.kind === "IP" ? (masked ? maskIp(s.value) : s.value) : shortDevice(s.value)}</span>
            </span>
          ),
          event: t(`events.${s.firstEvent}`),
          first: format.dateTime(s.firstSeenAt, { dateStyle: "short", timeStyle: "short" }),
          last: format.dateTime(s.lastSeenAt, { dateStyle: "short", timeStyle: "short" }),
          others:
            s.otherCount === 0 ? (
              <span className="text-text-muted">{t("noOther")}</span>
            ) : (
              <span className="text-xs break-all">
                {s.others.map((o, i) => (
                  <span key={o.id}>{i > 0 && ", "}<Link href={`/admin/utilisateurs/${o.id}`} className="underline underline-offset-2">{o.username}</Link></span>
                ))}
                {s.otherCount > s.others.length && ` ${t("more", { count: s.otherCount - s.others.length })}`}
              </span>
            ),
        },
      }))}
    />
  );
}
