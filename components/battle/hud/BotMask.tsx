import { useId } from "react";

// Masques des bots, dessinés pour Kiraku d'après les figures du folklore : un disque laqué et le
// masque par-dessus. Décoratifs : le nom du bot est lu à côté.

type Bot = "TENGU" | "KITSUNE" | "KAPPA" | "TANUKI" | "ONI" | "KARASU" | "YUREI" | "RONIN";

function Face({ bot }: { bot: Bot }) {
  switch (bot) {
    case "TENGU":
      return (
        <g>
          <path d="M20 9c7 0 11 5 11 12 0 6-4 11-11 11S9 27 9 21c0-7 4-12 11-12z" fill="#c8372d" />
          <path d="M19 19c2-1 4-1 5 1l9 9c1 1 0 3-2 2l-11-6c-2-1-3-5-1-6z" fill="#e0533f" stroke="#7d1a14" strokeWidth=".8" />
          <path d="M11 15c3-3 6-3 8-1M29 15c-3-3-6-3-8-1" stroke="#f3ecdf" strokeWidth="2.4" strokeLinecap="round" fill="none" />
          <path d="M13.5 18.5h3M23.5 18.5h3" stroke="#15120f" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M14 28c2 2 5 3 8 2" stroke="#f3ecdf" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </g>
      );
    case "KITSUNE":
      return (
        <g>
          <path d="M9 8l6 7h10l6-7 1 13c0 7-5 12-12 12S8 28 8 21z" fill="#f8f2e4" stroke="#c9b99e" strokeWidth=".8" />
          <path d="M10.5 10l3.5 4.5M29.5 10l-3.5 4.5" stroke="#c8372d" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M12.5 20c2-2 4-2 5.5 0M22 20c1.5-2 3.5-2 5.5 0" stroke="#c8372d" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <path d="M18 27.5l2 1.5 2-1.5" stroke="#15120f" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="20" cy="13" r="1.4" fill="#d9b556" />
        </g>
      );
    case "KAPPA":
      return (
        <g>
          <path d="M20 10c7 0 11 5 11 12 0 6-5 11-11 11S9 28 9 22c0-7 4-12 11-12z" fill="#5c7f45" />
          <ellipse cx="20" cy="9.5" rx="7.5" ry="2.6" fill="#a7c8d6" stroke="#2c5a86" strokeWidth=".8" />
          <circle cx="15.5" cy="19" r="2.2" fill="#f3ecdf" />
          <circle cx="24.5" cy="19" r="2.2" fill="#f3ecdf" />
          <circle cx="15.8" cy="19.3" r="1" fill="#15120f" />
          <circle cx="24.2" cy="19.3" r="1" fill="#15120f" />
          <path d="M15 25.5c2 2.5 8 2.5 10 0l-5 4z" fill="#d9b556" stroke="#8a6a1f" strokeWidth=".7" strokeLinejoin="round" />
        </g>
      );
    case "TANUKI":
      return (
        <g>
          <path d="M11 11l4 3h10l4-3 1 9c1 8-4 13-10 13S10 28 10 20z" fill="#8c6a4a" />
          <path d="M12 18c2-3 6-3 7 1-1 3-6 4-7-1zM28 18c-2-3-6-3-7 1 1 3 6 4 7-1z" fill="#3a2a1e" />
          <circle cx="15.5" cy="18.5" r="1.2" fill="#f3ecdf" />
          <circle cx="24.5" cy="18.5" r="1.2" fill="#f3ecdf" />
          <path d="M16 25c2 3 6 3 8 0-2-2-6-2-8 0z" fill="#e9dcc2" />
          <circle cx="20" cy="24.6" r="1.4" fill="#15120f" />
        </g>
      );
    case "ONI":
      return (
        <g>
          <path d="M12 7l3 6M28 7l-3 6" stroke="#e9dcc2" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M20 11c7 0 11 4 11 11 0 6-5 11-11 11S9 28 9 22c0-7 4-11 11-11z" fill="#9c2a22" />
          <path d="M11.5 18l6 2M28.5 18l-6 2" stroke="#15120f" strokeWidth="2" strokeLinecap="round" />
          <circle cx="15.5" cy="20.5" r="1.4" fill="#f2d88a" />
          <circle cx="24.5" cy="20.5" r="1.4" fill="#f2d88a" />
          <path d="M13 26c4 3 10 3 14 0-4 1.5-10 1.5-14 0z" fill="#15120f" />
          <path d="M15 26.6l1 2.6 1-2.2M25 26.6l-1 2.6-1-2.2" fill="#f3ecdf" />
        </g>
      );
    case "KARASU":
      return (
        <g>
          <path d="M20 9c7 0 11 5 11 12 0 6-4 10-11 10S9 27 9 21c0-7 4-12 11-12z" fill="#1f1b17" />
          <path d="M14 20c3-1 9-1 12 0l-6 13z" fill="#d9b556" stroke="#8a6a1f" strokeWidth=".8" strokeLinejoin="round" />
          <circle cx="15" cy="17" r="1.6" fill="#e0533f" />
          <circle cx="25" cy="17" r="1.6" fill="#e0533f" />
          <path d="M10 12c3 1 5 3 6 5M30 12c-3 1-5 3-6 5" stroke="#5a4d3c" strokeWidth="1.2" fill="none" />
        </g>
      );
    case "YUREI":
      return (
        <g>
          <path d="M9 32V18c0-7 5-11 11-11s11 4 11 11v14l-3-3-2 4-2-4-2 4-2-4-2 4-2-4-2 4-2-4z" fill="#15120f" />
          <path d="M20 12c5 0 7 4 7 9 0 5-3 9-7 9s-7-4-7-9 2-9 7-9z" fill="#e8f0fb" />
          <path d="M16.5 10.5L20 6l3.5 4.5z" fill="#f8f2e4" stroke="#c9b99e" strokeWidth=".6" />
          <path d="M16 20h3M21 20h3" stroke="#2c5a86" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M18.5 26c1 .6 2 .6 3 0" stroke="#7fa3d1" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        </g>
      );
    case "RONIN":
      return (
        <g>
          <path d="M20 13c6 0 9 5 9 10s-4 10-9 10-9-5-9-10 3-10 9-10z" fill="#3a3029" />
          <path d="M4 20C8 12 14 8 20 8s12 4 16 12c-5 2-11 3-16 3S9 22 4 20z" fill="#c9a86a" stroke="#7a5a2a" strokeWidth=".8" />
          <path d="M8 18c4-1 8-1.5 12-1.5s8 .5 12 1.5M12 14c3-.6 5-.8 8-.8s5 .2 8 .8" stroke="#8a6a3a" strokeWidth=".7" fill="none" />
          <path d="M15.5 26h3M21.5 26h3" stroke="#d9b556" strokeWidth="1.4" strokeLinecap="round" />
        </g>
      );
  }
}

const BOTS = new Set<string>(["TENGU", "KITSUNE", "KAPPA", "TANUKI", "ONI", "KARASU", "YUREI", "RONIN"]);

export function BotMask({ bot, size }: { bot: string | null; size: number }) {
  const id = useId();
  const known = bot && BOTS.has(bot) ? (bot as Bot) : "RONIN";
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 40 40" className="bot-mask">
      <defs>
        <radialGradient id={`${id}-l`} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#3a3029" />
          <stop offset="1" stopColor="#120f0c" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="19" fill={`url(#${id}-l)`} stroke="#d9b556" strokeOpacity=".55" strokeWidth="1.2" />
      <Face bot={known} />
    </svg>
  );
}
