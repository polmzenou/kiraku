import Image from "next/image";

/** Avatar rond d'un joueur : image Discord, sinon l'initiale du pseudo sur papier. */
export function PlayerAvatar({
  username,
  image,
  size,
  className = "",
}: {
  username: string;
  image: string | null;
  size: number;
  className?: string;
}) {
  if (image) {
    return (
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
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 font-title font-bold ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {username.charAt(0).toUpperCase()}
    </span>
  );
}
