import Image from "next/image";
import type { FrameStyle } from "@/lib/profile/frames";
import { AvatarFrame } from "../profile/AvatarFrame";

/** Avatar rond d'un joueur : image Discord, sinon l'initiale du pseudo sur papier, dans son cadre s'il en porte un. */
export function PlayerAvatar({
  username,
  image,
  size,
  frame = null,
  className = "",
}: {
  username: string;
  image: string | null;
  size: number;
  frame?: FrameStyle | null;
  className?: string;
}) {
  const avatar = image ? (
    <Image
      src={image}
      alt=""
      crossOrigin="anonymous"
      referrerPolicy="no-referrer"
      width={size}
      height={size}
      className={`shrink-0 rounded-full object-cover ${className}`}
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 font-title font-bold ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {username.charAt(0).toUpperCase()}
    </span>
  );
  return (
    <AvatarFrame frame={frame} size={size}>
      {avatar}
    </AvatarFrame>
  );
}
