/* eslint-disable @next/next/no-img-element -- rendu PNG Satori, pas du DOM */
import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { SeasonSnapshot } from "@/lib/discord/season";
import { seasonRankName } from "@/lib/discord/season";
import { rankArtworkPath } from "@/lib/ranked/artwork";
import { ogFonts, ogSeal, remoteImage } from "../og/assets";

const PALETTE = { BRONZE: "#bd8a58", SILVER: "#c6c9d2", GOLD: "#d9b556", EMERALD: "#71bc92", ELITE: "#71add0", CHAMPION: "#d84e3d", GRAND_CHAMPION: "#c9ace8" };
type Entry = SeasonSnapshot["entries"][number];
type Art = { emblem: string; avatar: string | null };

export async function seasonImage(snapshot: SeasonSnapshot, withAvatars = true, preview = false): Promise<ImageResponse> {
  const height = 434 + Math.max(snapshot.entries.length, 1) * 76;
  const [fonts, seal, art] = await Promise.all([
    ogFonts(), ogSeal(),
    Promise.all(snapshot.entries.map(async (entry): Promise<Art> => ({
      emblem: `data:image/png;base64,${(await readFile(join(process.cwd(), "public", rankArtworkPath(entry.tier, entry.division)))).toString("base64")}`,
      avatar: withAvatars ? await remoteImage(entry.image) : null,
    }))),
  ]);
  const images = new Map(snapshot.entries.map((entry, i) => [entry.position, art[i]]));
  const podium = [2, 1, 3];
  const formatPc = (pc: number) => `${new Intl.NumberFormat("fr-FR").format(pc)} PC`;
  const emblem = (entry: Entry, size: number) => <img src={images.get(entry.position)!.emblem} width={size} height={size * 140 / 120} alt="" />;
  const waves = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="64"><path d="M-25 64a50 50 0 0 1 100 0M-15 64a40 40 0 0 1 80 0M-5 64a30 30 0 0 1 60 0M5 64a20 20 0 0 1 40 0M15 64a10 10 0 0 1 20 0M25 0a50 50 0 0 1 100 0M35 0a40 40 0 0 1 80 0M45 0a30 30 0 0 1 60 0" fill="none" stroke="#d9b556" stroke-opacity=".07"/></svg>').toString("base64")}`;
  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "26px 30px", backgroundColor: "#15120f", color: "#f1e9da", fontFamily: "Zen Kaku Gothic New", fontWeight: 500 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 68, paddingBottom: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", fontFamily: "Dela Gothic One", fontSize: 27 }}>Classé · saison {snapshot.number}</div>
          <div style={{ display: "flex", fontSize: 15, color: "#a89f92" }}>{preview ? "Aperçu du classement actuel" : "Classement public final"}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "Shippori Mincho B1", fontWeight: 800, fontSize: 24 }}>
          <img src={seal} width={42} height={42} alt="" />KIRAKU
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, height: 240, paddingTop: 10 }}>
        {podium.map((position) => {
          const entry = snapshot.entries.find((row) => row.position === position);
          const color = entry ? PALETTE[entry.tier] : "#635748";
          return (
            <div key={position} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 369, height: position === 1 ? 226 : 196, gap: 5, border: `2px solid ${color}`, borderRadius: 18, backgroundColor: "#1c1814", backgroundImage: `url(${waves})`, boxShadow: `0 0 18px ${color}40` }}>
              <div style={{ display: "flex", fontFamily: "Shippori Mincho B1", fontWeight: 800, color, fontSize: 30 }}>{position}</div>
              {entry ? <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                {emblem(entry, position === 1 ? 78 : 62)}
                <div style={{ display: "flex", color: "#a9d8b1", fontSize: 21, fontWeight: 700, maxWidth: 330, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{entry.username}</div>
                <div style={{ display: "flex", color: "#a89f92", fontSize: 16 }}>{formatPc(entry.pc)}</div>
              </div> : <div style={{ display: "flex", fontSize: 18, color: "#a89f92", marginTop: 32 }}>{position <= snapshot.total ? "Profil privé" : "—"}</div>}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 22, border: "1px solid #3a322a", borderRadius: 18, backgroundColor: "#28231d", padding: "4px 22px" }}>
        {snapshot.entries.length === 0 ? <div style={{ display: "flex", height: 76, alignItems: "center", justifyContent: "center", color: "#a89f92", fontSize: 22 }}>Aucun joueur public classé cette saison</div> : snapshot.entries.map((entry) => {
          const avatar = images.get(entry.position)!.avatar;
          return <div key={entry.position} style={{ display: "flex", alignItems: "center", height: 76, gap: 16 }}>
            <div style={{ display: "flex", width: 50, height: 50, border: `2px solid ${PALETTE[entry.tier]}`, borderRadius: 25, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "#15120f", fontSize: 23 }}>
              {avatar ? <img src={avatar} width={46} height={46} alt="" style={{ objectFit: "cover" }} /> : entry.username.slice(0, 1).toUpperCase()}
            </div>
            <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, gap: 2 }}>
              <div style={{ display: "flex", fontSize: 23, color: entry.position <= 3 ? "#a9d8b1" : "#f1e9da", fontWeight: 700 }}>{entry.username}</div>
              <div style={{ display: "flex", fontSize: 16, color: "#a89f92" }}>{seasonRankName(entry)} · {formatPc(entry.pc)}</div>
            </div>
            {emblem(entry, 34)}
            <div style={{ display: "flex", justifyContent: "flex-end", width: 54, fontFamily: "Shippori Mincho B1", fontWeight: 800, fontSize: 28, color: "#c4b4a0" }}>{entry.position}</div>
          </div>;
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, fontSize: 15, color: "#a89f92" }}>
        <span>Début de la saison {snapshot.nextNumber} · Bon courage à tous !</span>
        <span>kiraku-kun.com</span>
      </div>
    </div>,
    { width: 1200, height, fonts },
  );
}
