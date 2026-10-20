"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import type { ProfileVisibility } from "@/lib/collection/visibility";
import { BADGE_KANJI, BIO_MAX, type Badge } from "@/lib/profile/conditions";
import { saveProfileAction } from "@/server/actions/profile";
import type { CosmeticOption } from "@/server/profile/progress";
import { PlayerAvatar } from "../social/PlayerAvatar";
import { Button } from "../ui/Button";
import { segmentedFillClass, segmentedItemClass, segmentedTrackClass } from "../ui/Segmented";
import { Sheet } from "../ui/Sheet";
import { AvatarFrame } from "./AvatarFrame";
import { PrivacyForm } from "./PrivacyForm";

export type ProfileChoices = {
  bio: string;
  titleAgreement: "MASC" | "FEM";
  titleId: string | null;
  frameId: string | null;
  badgeOrder: Badge[];
};

type Props = {
  username: string;
  image: string | null;
  initial: ProfileChoices;
  options: CosmeticOption[];
  badges: Badge[];
  privacy: { visibility: ProfileVisibility; showCollection: boolean };
};

/**
 * « Personnaliser mon profil » : bio, accord des titres, titre, badges affichés et cadre d'avatar.
 * Les titres et cadres verrouillés montrent comment les obtenir et où en est le joueur ; le serveur
 * revérifie chaque choix à l'enregistrement.
 */
export function ProfileCustomizeButton(props: Props) {
  const t = useTranslations("profile.customize");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <span aria-hidden="true" lang="ja" className="font-seal text-shu">
          飾
        </span>
        {t("open")}
      </Button>
      {open && <ProfileCustomizeSheet {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

function ProfileCustomizeSheet({ username, image, initial, options, badges, privacy, onClose }: Props & { onClose: () => void }) {
  const t = useTranslations("profile.customize");
  const router = useRouter();
  const [tab, setTab] = useState<"look" | "privacy">("look");
  const [draft, setDraft] = useState(initial);
  const [focused, setFocused] = useState<CosmeticOption | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bioId = useId();
  const titles = options.filter((o) => o.kind === "TITLE");
  const frames = options.filter((o) => o.kind === "FRAME");
  const unlockedTitles = titles.filter((o) => o.progress.unlocked).length;
  const unlockedFrames = frames.filter((o) => o.progress.unlocked).length;
  const title = titles.find((o) => o.id === draft.titleId);
  const frame = frames.find((o) => o.id === draft.frameId);
  const shownBadges = draft.badgeOrder.length > 0 ? draft.badgeOrder : badges;
  const set = (patch: Partial<ProfileChoices>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setError(null);
  };

  const toggleBadge = (b: Badge) =>
    set({ badgeOrder: draft.badgeOrder.includes(b) ? draft.badgeOrder.filter((x) => x !== b) : [...draft.badgeOrder, b] });

  const save = () =>
    startTransition(async () => {
      try {
        const res = await saveProfileAction(draft);
        if (!res.ok) {
          setError(t(`errors.${res.error}`));
          return;
        }
        router.refresh();
        onClose();
      } catch {
        setError(t("errors.UNAVAILABLE"));
      }
    });

  return (
    <Sheet open onClose={onClose} title={t("title")} wide>
      {/* Aperçu de l'en-tête, mis à jour à chaque choix */}
      <div className="flex items-center gap-4 lacquer rounded-card p-4">
        <AvatarFrame frame={frame?.frameStyle ?? null} size={64}>
          <PlayerAvatar username={username} image={image} size={64} />
        </AvatarFrame>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate font-title text-xl font-extrabold">{username}</p>
          {title && <p className="text-sm font-bold text-kin">{title.labels[draft.titleAgreement]}</p>}
          {shownBadges.length > 0 && <BadgeRow badges={shownBadges} />}
          {draft.bio.trim() && <p className="line-clamp-2 text-sm text-text-muted">{draft.bio}</p>}
        </div>
      </div>

      <div role="tablist" aria-label={t("tabsLabel")} className={`${segmentedTrackClass} ${segmentedFillClass}`}>
        {(["look", "privacy"] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={segmentedItemClass}>
            {t(`tabs.${k}`)}
          </button>
        ))}
      </div>

      {tab === "privacy" ? (
        <PrivacyForm visibility={privacy.visibility} showCollection={privacy.showCollection} />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <label htmlFor={bioId} className="font-title text-base font-bold">
              {t("bio")}
            </label>
            <textarea
              id={bioId}
              value={draft.bio}
              maxLength={BIO_MAX}
              rows={2}
              placeholder={t("bioPlaceholder")}
              onChange={(e) => set({ bio: e.target.value })}
              className="min-h-20 resize-none rounded-control border border-border bg-surface px-3 py-2.5 text-base text-text placeholder:text-text-muted"
            />
            <p className="self-end text-xs text-text-muted tabular-nums">
              {draft.bio.length}/{BIO_MAX}
            </p>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-title text-base font-bold">
              {t("agreement")} <span className="text-xs font-normal text-text-muted">{t("agreementHint")}</span>
            </legend>
            <div className={`${segmentedTrackClass} ${segmentedFillClass} max-w-sm`}>
              {(["MASC", "FEM"] as const).map((a) => (
                <label key={a} className={segmentedItemClass}>
                  <input type="radio" name="agreement" className="sr-only" checked={draft.titleAgreement === a} onChange={() => set({ titleAgreement: a })} />
                  {t(`agreements.${a}`)}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-title text-base font-bold">
              {t("titleLabel")} <span className="text-xs font-normal text-text-muted">{t("unlocked", { count: unlockedTitles, total: titles.length })}</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              <Chip selected={draft.titleId === null} onClick={() => set({ titleId: null })}>
                {t("none")}
              </Chip>
              {titles.map((o) => (
                <Chip
                  key={o.id}
                  selected={draft.titleId === o.id}
                  locked={!o.progress.unlocked}
                  hint={o.hint}
                  onClick={() => (o.progress.unlocked ? set({ titleId: o.id }) : setFocused(o))}
                >
                  {o.labels[draft.titleAgreement]}
                </Chip>
              ))}
            </div>
            {focused?.kind === "TITLE" && <LockedHint option={focused} agreement={draft.titleAgreement} />}
          </fieldset>

          {badges.length > 0 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 font-title text-base font-bold">
                {t("badges")} <span className="text-xs font-normal text-text-muted">{t("badgesHint")}</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {badges.map((b) => {
                  const position = draft.badgeOrder.indexOf(b);
                  return (
                    <Chip key={b} selected={position >= 0} onClick={() => toggleBadge(b)}>
                      <span aria-hidden="true" lang="ja" className="font-seal text-kin">
                        {BADGE_KANJI[b]}
                      </span>
                      {t(`badgeNames.${b}`)}
                      {position >= 0 && <span className="text-xs tabular-nums opacity-70">{position + 1}</span>}
                    </Chip>
                  );
                })}
              </div>
            </fieldset>
          )}

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-title text-base font-bold">
              {t("frame")} <span className="text-xs font-normal text-text-muted">{t("unlocked", { count: unlockedFrames, total: frames.length })}</span>
            </legend>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              <li>
                <FrameTile label={t("none")} selected={draft.frameId === null} onClick={() => set({ frameId: null })}>
                  <PlayerAvatar username={username} image={image} size={48} />
                </FrameTile>
              </li>
              {frames.map((o) => (
                <li key={o.id}>
                  <FrameTile
                    label={o.labels[draft.titleAgreement]}
                    selected={draft.frameId === o.id}
                    locked={!o.progress.unlocked}
                    detail={o.progress.unlocked ? null : `${o.progress.current}/${o.progress.goal}`}
                    hint={o.hint}
                    onClick={() => (o.progress.unlocked ? set({ frameId: o.id }) : setFocused(o))}
                  >
                    <AvatarFrame frame={o.frameStyle} size={48}>
                      <PlayerAvatar username={username} image={image} size={48} />
                    </AvatarFrame>
                  </FrameTile>
                </li>
              ))}
            </ul>
            {focused?.kind === "FRAME" && <LockedHint option={focused} agreement={draft.titleAgreement} />}
          </fieldset>

          {error && (
            <p role="alert" className="text-sm text-shu">
              {error}
            </p>
          )}
          <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-border bg-bg px-4 py-3 md:-mx-6 md:px-6">
            <Button type="button" onClick={onClose} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button type="button" variant="primary" onClick={save} disabled={pending}>
              {pending ? t("saving") : t("save")}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function Chip({
  selected,
  locked = false,
  hint,
  onClick,
  children,
}: {
  selected: boolean;
  locked?: boolean;
  hint?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      title={locked ? hint : undefined}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-pill border px-3.5 text-sm font-bold transition-colors ${
        selected ? "border-shu bg-shu/15 text-text" : "border-border text-text-muted hover:text-text"
      } ${locked ? "opacity-55" : ""}`}
    >
      {locked && <LockIcon />}
      {children}
    </button>
  );
}

function FrameTile({
  label,
  selected,
  locked = false,
  detail,
  hint,
  onClick,
  children,
}: {
  label: string;
  selected: boolean;
  locked?: boolean;
  detail?: string | null;
  hint?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      title={locked ? hint : undefined}
      onClick={onClick}
      className={`flex min-h-28 w-full flex-col items-center gap-1.5 rounded-card border p-2 text-center text-xs transition-colors ${
        selected ? "border-shu bg-shu/10" : "border-border hover:border-text-muted/50"
      }`}
    >
      <span className={locked ? "opacity-45 grayscale" : ""}>{children}</span>
      <span className="flex items-center gap-1 font-bold">
        {locked && <LockIcon />}
        {label}
      </span>
      {detail && <span className="text-text-muted tabular-nums">{detail}</span>}
    </button>
  );
}

/** Comment obtenir un titre ou un cadre verrouillé (toucher sur mobile, survol sur desktop). */
function LockedHint({ option, agreement }: { option: CosmeticOption; agreement: "MASC" | "FEM" }) {
  const t = useTranslations("profile.customize");
  const { current, goal } = option.progress;
  return (
    <p role="status" className="flex flex-wrap items-center gap-2 rounded-control border border-border bg-surface px-3 py-2 text-sm">
      <LockIcon />
      <span className="font-bold">{option.labels[agreement]}</span>
      <span className="text-text-muted">{option.hint || t("noHint")}</span>
      {goal > 1 && <span className="ml-auto text-xs tabular-nums text-text-muted">{t("progress", { current, goal })}</span>}
    </p>
  );
}

function LockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 shrink-0 fill-current">
      <path d="M5 7V5a3 3 0 1 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-5A1.5 1.5 0 0 1 4.5 7H5Zm1.5 0h3V5a1.5 1.5 0 0 0-3 0v2Z" />
    </svg>
  );
}

/** Badges d'un joueur : sceau et nom. */
export function BadgeRow({ badges }: { badges: readonly Badge[] }) {
  const t = useTranslations("profile.customize");
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={t("badges")}>
      {badges.map((b) => (
        <li key={b} className="inline-flex items-center gap-1 rounded-pill border border-kin/50 px-2 py-0.5 text-xs font-bold text-kin">
          <span aria-hidden="true" lang="ja" className="font-seal">
            {BADGE_KANJI[b]}
          </span>
          {t(`badgeNames.${b}`)}
        </li>
      ))}
    </ul>
  );
}
