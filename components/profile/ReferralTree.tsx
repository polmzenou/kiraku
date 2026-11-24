import { getTranslations } from "next-intl/server";
import { layoutTree, type TreeInput, type TreeLayout } from "@/lib/referral/tree-layout";
import { referralV2Rules } from "@/server/referral/deps";
import { referralTreeOf, type TreeNodeView } from "@/server/referral/tree";
import { getSetting } from "@/server/settings";
import { ThemedArt } from "../referral/ThemedArt";
import { ReferralTreeToggle } from "./ReferralTreeToggle";

// Couleurs des nœuds : parrain en indigo, le joueur en vermillon, ses filleuls en or, les leurs en gris chaud
const FILL = { up: "#1e3557", me: "#c8372d", kid: "#b08a2e", grand: "#6b645a" } as const;
const THREAD = "#c8372d";

function TreeSvg({ layout, label, upRole, others }: { layout: TreeLayout; label: string; upRole: string; others: (n: number) => string }) {
  const text = "fill-text text-[11px] font-bold";
  const sub = "fill-text-muted text-[9.5px] font-medium";
  return (
    <svg viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label={label} className="block h-auto w-full overflow-visible">
      {layout.threads.map((th, i) => (
        <path key={i} d={th.d} fill="none" stroke={THREAD} strokeOpacity={th.dim ? 0.45 : 1} strokeWidth={2.4} strokeLinecap="round" />
      ))}
      {layout.up && (
        <g>
          <circle cx={layout.up.x} cy={layout.up.y} r={17} fill={FILL.up} className="stroke-bg" strokeWidth={2} />
          <text x={layout.up.x} y={layout.up.y + 5} textAnchor="middle" className="text-[11px] font-bold" fill="#f3ecdf">
            {layout.up.initial}
          </text>
          <text x={layout.up.x + 24} y={layout.up.y - 4} className={sub}>
            {upRole}
          </text>
          <text x={layout.up.x + 24} y={layout.up.y + 9} className={text}>
            {layout.up.label}
          </text>
        </g>
      )}
      {layout.grandkids.map((g) => (
        <g key={g.key}>
          <circle cx={g.x} cy={g.y} r={9} fill={FILL.grand} className="stroke-bg" strokeWidth={2} />
          {g.showLabel && (
            <text x={g.x} y={g.labelY} textAnchor="middle" className={sub}>
              {g.label}
            </text>
          )}
        </g>
      ))}
      {layout.grandMore.map((m, i) => (
        <g key={`gm${i}`}>
          <circle cx={m.x} cy={m.y} r={9} className="fill-surface-2 stroke-border" strokeWidth={1.5} />
          <text x={m.x} y={m.y + 3} textAnchor="middle" className="fill-text text-[8px] font-bold">
            +{m.count}
          </text>
        </g>
      ))}
      <circle cx={layout.me.x} cy={layout.me.y} r={24} fill="none" stroke={THREAD} strokeWidth={2.5} />
      <circle cx={layout.me.x} cy={layout.me.y} r={20} fill={FILL.me} className="stroke-bg" strokeWidth={2} />
      <text x={layout.me.x} y={layout.me.y + 5} textAnchor="middle" className="text-[11px] font-bold" fill="#f3ecdf">
        {layout.me.initial}
      </text>
      <text x={layout.me.x + 32} y={layout.me.y + 4} className={text}>
        {layout.me.label}
      </text>
      {layout.kids.map((k) => (
        <g key={k.key}>
          <circle cx={k.x} cy={k.y} r={16} fill={FILL.kid} className="stroke-bg" strokeWidth={2} />
          <text x={k.x} y={k.y + 5} textAnchor="middle" className="text-[11px] font-bold" fill="#f3ecdf">
            {k.initial}
          </text>
          <text x={k.x} y={k.y + 34} textAnchor="middle" className={sub}>
            {k.label}
          </text>
        </g>
      ))}
      {layout.more && (
        <g>
          <circle cx={layout.more.x} cy={layout.more.y} r={16} className="fill-surface-2 stroke-border" strokeWidth={1.5} />
          <text x={layout.more.x} y={layout.more.y + 4} textAnchor="middle" className={`fill-text font-bold ${layout.more.count > 99 ? "text-[8.5px]" : "text-[10px]"}`}>
            +{Math.min(layout.more.count, 999)}
          </text>
          <text x={layout.more.x} y={layout.more.y + 34} textAnchor="middle" className={sub}>
            {others(layout.more.count)}
          </text>
        </g>
      )}
    </svg>
  );
}

/**
 * Arbre des liens sur le profil (maquette « Arbre ») : parrain, joueur, filleuls installés et les leurs, sur le fond
 * PV2-ARBRE-FOND. Le propriétaire le voit toujours (même vide ou masqué) et peut le masquer ; un visiteur ne voit qu'un
 * arbre montré et non vide. Rien tant que le parrainage v2 est coupé.
 */
export async function ProfileReferralTree({ ownerId, ownerName, viewerId, isOwner }: { ownerId: string; ownerName: string; viewerId: string | null; isOwner: boolean }) {
  if (!(await getSetting("referral.v2.enabled"))) return null;
  const tree = await referralTreeOf(ownerId, viewerId);
  const empty = !tree.up && tree.kids.length === 0;
  if (!isOwner && (tree.hidden || empty)) return null;
  const [t, rules] = await Promise.all([getTranslations("profile.tree"), isOwner && empty ? referralV2Rules() : null]);

  const name = (n: TreeNodeView) => n.name ?? t("private");
  const input: TreeInput = {
    me: { key: "me", name: ownerName },
    up: tree.up ? { key: tree.up.key, name: name(tree.up) } : null,
    kids: tree.kids.map((k) => ({ person: { key: k.node.key, name: name(k.node) }, kids: k.kids.map((g) => ({ key: g.key, name: name(g) })) })),
  };
  const sub = tree.counts.kids
    ? [t("kids", { count: tree.counts.kids }), ...(tree.counts.grandkids ? [t("grandkids", { count: tree.counts.grandkids })] : [])].join(" · ")
    : tree.up
      ? t(tree.ownerFem ? "referredByFem" : "referredBy", { name: name(tree.up) })
      : t("none");
  const upRole = tree.up?.fem ? t("referrerFem") : t("referrer");
  const label = tree.up ? t("labelUp", { name: ownerName, kids: tree.counts.kids, up: name(tree.up) }) : t("label", { name: ownerName, kids: tree.counts.kids });
  const others = (n: number) => t("others", { count: n });

  return (
    <section className="flex flex-col gap-3 lacquer rounded-card p-4" aria-labelledby="arbre-des-liens">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" lang="ja" className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-shu-btn font-seal text-lg text-washi-paper">
          系
        </span>
        <div className="min-w-0">
          <h2 id="arbre-des-liens" className="font-title text-lg font-bold">
            {t("title")}
          </h2>
          <p className="text-xs text-text-muted">{sub}</p>
        </div>
      </div>

      {tree.hidden ? (
        <div className="flex items-center gap-3 rounded-control border border-dashed border-border p-4">
          <span aria-hidden="true" lang="ja" className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-surface-2 font-seal text-lg text-text-muted">
            秘
          </span>
          <p className="text-sm">
            <b>{t("hiddenTitle")}</b>
            <br />
            <span className="text-xs text-text-muted">{t("hiddenBody")}</span>
          </p>
        </div>
      ) : empty ? (
        <p className="text-sm text-text-muted">{t("empty", { openings: rules?.installOpenings ?? 20, days: Math.max(1, Math.round((rules?.installHours ?? 48) / 24)) })}</p>
      ) : (
        <>
          <div className="relative isolate overflow-hidden rounded-control border border-border">
            <ThemedArt base="arbre-fond" sizes="(min-width: 768px) 720px, 100vw" className="-z-10 opacity-90" />
            <div className="px-2 py-3 md:hidden">
              <TreeSvg layout={layoutTree(input, false)} label={label} upRole={upRole} others={others} />
            </div>
            <div className="mx-auto hidden max-w-160 px-4 py-4 md:block">
              <TreeSvg layout={layoutTree(input, true)} label={label} upRole={upRole} others={others} />
            </div>
          </div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-muted">
            <span>{t("legendInstalled")}</span>
            <span>{t("legendPrivate")}</span>
          </p>
        </>
      )}

      {isOwner && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <span className="text-xs text-text-muted">{tree.hidden ? t("hiddenOwner") : t("visibleOwner")}</span>
          <ReferralTreeToggle hidden={tree.hidden} />
        </div>
      )}
    </section>
  );
}
