// Illustrations du bac à sable du combat : six combattants originaux dessinés pour Kiraku (aucun
// personnage existant), en silhouettes d'estampe sur fonds peints. Servies en data URI : la page
// d'aperçu et l'artifact n'ont besoin d'aucun fichier ni d'aucun réseau.

const svg = (body: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 500 700'>${body}</svg>`)}`;

/** Pétales semés (position, rotation) pour les fonds. */
const petals = (color: string, pts: readonly [number, number, number][]) =>
  pts.map(([x, y, r]) => `<path transform='translate(${x} ${y}) rotate(${r})' d='M0 0c6-8 16-8 18 0-2 8-12 8-18 0z' fill='${color}'/>`).join("");

export const AKANE = svg(`
<defs>
  <linearGradient id='a' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#26090c'/><stop offset='.45' stop-color='#8f1f1a'/><stop offset='.8' stop-color='#d9503c'/></linearGradient>
  <radialGradient id='s' cx='50%' cy='50%' r='50%'><stop offset='0' stop-color='#fff1c4'/><stop offset='.7' stop-color='#f6d7a0'/><stop offset='1' stop-color='#e8a87a'/></radialGradient>
</defs>
<rect width='500' height='700' fill='url(#a)'/>
<circle cx='300' cy='230' r='172' fill='url(#s)'/>
<circle cx='300' cy='230' r='172' fill='none' stroke='#c8372d' stroke-width='6' opacity='.6'/>
${petals("#f1c6d3", [[70, 120, 20], [420, 80, 80], [440, 360, 140], [60, 330, 200], [380, 520, 40], [110, 560, 300]])}
<path d='M120 540L446 70' stroke='#f3ecdf' stroke-width='12' stroke-linecap='round'/>
<path d='M120 540L446 70' stroke='#9aa4ad' stroke-width='4' stroke-linecap='round'/>
<ellipse cx='176' cy='459' rx='26' ry='12' transform='rotate(-55 176 459)' fill='#1b1210'/>
<path d='M300 150c40-30 104-36 140-6 18 16 4 40-18 30-30-14-66-8-96 14z' fill='#120c0b'/>
<path d='M436 150c22 26 28 80 4 130-8 16-28 8-24-10 10-40 6-80-12-104z' fill='#120c0b'/>
<path d='M318 150c-6-12 2-26 16-22l10 22z' fill='#c8372d'/>
<ellipse cx='262' cy='214' rx='54' ry='64' fill='#120c0b'/>
<path d='M210 196c10-40 62-62 104-30-30-6-58 2-76 26z' fill='#120c0b'/>
<path d='M246 270h34l6 42h-46z' fill='#120c0b'/>
<path d='M118 700c-6-140 22-230 96-268 26-14 70-16 104-2 84 34 120 140 118 270z' fill='#120c0b'/>
<path d='M214 432l52 120 50-122' fill='none' stroke='#c8372d' stroke-width='10'/>
<path d='M150 520c10-40 30-66 52-76l-8 70z' fill='#1b1210'/>
<path d='M212 178c4-14 16-24 30-28' stroke='#ffd9c0' stroke-width='3' fill='none' opacity='.8'/>
<path d='M210 230c0 22 8 38 22 48' stroke='#ffd9c0' stroke-width='2.5' fill='none' opacity='.6'/>`);

export const TSUKIYO = svg(`
<defs>
  <linearGradient id='a' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#0b1226'/><stop offset='.55' stop-color='#1e3557'/><stop offset='1' stop-color='#2c5a86'/></linearGradient>
  <radialGradient id='m' cx='50%' cy='50%' r='50%'><stop offset='0' stop-color='#fbf7ee'/><stop offset='.8' stop-color='#e9e2d0'/><stop offset='1' stop-color='#c9dcf3'/></radialGradient>
  <radialGradient id='h' cx='50%' cy='50%' r='50%'><stop offset='0' stop-color='#c9dcf3' stop-opacity='.45'/><stop offset='1' stop-color='#c9dcf3' stop-opacity='0'/></radialGradient>
</defs>
<rect width='500' height='700' fill='url(#a)'/>
<circle cx='320' cy='210' r='230' fill='url(#h)'/>
<circle cx='320' cy='210' r='140' fill='url(#m)'/>
${[[60, 70], [120, 160], [440, 420], [90, 300], [470, 120], [210, 50], [400, 560]].map(([x, y]) => `<circle cx='${x}' cy='${y}' r='2.4' fill='#f3ecdf'/>`).join("")}
<path d='M400 640L428 96' stroke='#8a6a3a' stroke-width='8' stroke-linecap='round'/>
<path d='M428 96l-30 18 26 14-24 18 28 14-22 20' fill='none' stroke='#f8f2e4' stroke-width='9' stroke-linejoin='round'/>
<path d='M430 96l30 20-26 12 26 18-28 12 22 22' fill='none' stroke='#f8f2e4' stroke-width='9' stroke-linejoin='round'/>
<path d='M196 160c18-46 104-52 128 6 18 44 18 130 30 220 10 76 26 140 46 314H112c14-150 36-240 50-310 12-66 18-160 34-230z' fill='#0c1220'/>
<ellipse cx='256' cy='206' rx='50' ry='60' fill='#0c1220'/>
<path d='M206 190c12-36 82-48 100 0-30-14-66-14-100 0z' fill='#0c1220'/>
<path d='M150 700c0-110 26-196 80-226 24 30 64 34 92 0 52 30 78 120 78 226z' fill='#e8f0fb'/>
<path d='M230 474l26 80 26-80' fill='none' stroke='#c8372d' stroke-width='9'/>
<path d='M150 700c20-60 40-100 80-130M400 700c-20-60-40-100-80-130' stroke='#c9dcf3' stroke-width='3' fill='none' opacity='.7'/>
<path d='M208 176c6-14 18-22 32-26' stroke='#c9dcf3' stroke-width='3' fill='none' opacity='.8'/>`);

export const KUROGANE = svg(`
<defs>
  <linearGradient id='a' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#14061a'/><stop offset='.5' stop-color='#5a1430'/><stop offset='1' stop-color='#c8372d'/></linearGradient>
  <linearGradient id='f' x1='0' y1='1' x2='0' y2='0'><stop offset='0' stop-color='#f2d88a'/><stop offset='.5' stop-color='#e0533f'/><stop offset='1' stop-color='#e0533f' stop-opacity='0'/></linearGradient>
</defs>
<rect width='500' height='700' fill='url(#a)'/>
${[[40, 520, 1], [150, 470, 0.8], [330, 500, 1.1], [440, 450, 0.9], [240, 430, 0.7]].map(([x, y, k]) => `<path transform='translate(${x} ${y}) scale(${k})' d='M0 200c-40-60-10-120 20-160 6 40 30 60 40 20 20 40 34 100-10 140z' fill='url(#f)' opacity='.75'/>`).join("")}
<path d='M330 120L420 40' stroke='#2a1a14' stroke-width='34' stroke-linecap='round'/>
${[[350, 104], [372, 84], [394, 64], [366, 112], [388, 92]].map(([x, y]) => `<circle cx='${x}' cy='${y}' r='6' fill='#d9b556'/>`).join("")}
<path d='M190 130c-24-40-20-78-6-104 6 30 22 52 44 64zM318 130c24-40 20-78 6-104-6 30-22 52-44 64z' fill='#e9dcc2'/>
<path d='M170 150c10-50 50-76 84-76s74 26 84 76c8 40-6 92-30 116H200c-24-24-38-76-30-116z' fill='#140a0c'/>
<path d='M164 128c20-30 46-42 90-44 44 2 70 14 90 44-30-10-60-14-90-14s-60 4-90 14z' fill='#2a1014'/>
<path d='M210 190l30 8M300 190l-30 8' stroke='#f2d88a' stroke-width='9' stroke-linecap='round'/>
<path d='M226 236c18 10 40 10 58 0' stroke='#f3ecdf' stroke-width='5' fill='none'/>
<path d='M60 700c0-170 60-290 194-300 134 10 194 130 194 300z' fill='#140a0c'/>
<path d='M120 470c30-30 80-50 134-50s104 20 134 50' stroke='#e0533f' stroke-width='4' fill='none' opacity='.6'/>
<path d='M300 420c40 0 70-40 64-110' stroke='#140a0c' stroke-width='48' stroke-linecap='round'/>`);

export const HAYATE = svg(`
<defs>
  <linearGradient id='a' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#071410'/><stop offset='.55' stop-color='#1d4a3a'/><stop offset='1' stop-color='#4fbf8f'/></linearGradient>
</defs>
<rect width='500' height='700' fill='url(#a)'/>
${[40, 110, 380, 450].map((x, i) => `<rect x='${x}' y='0' width='${18 + (i % 2) * 6}' height='700' fill='#0f2a20' opacity='.85'/>${[120, 300, 480].map((y) => `<rect x='${x - 2}' y='${y + i * 30}' width='${22 + (i % 2) * 6}' height='6' fill='#0a1f17'/>`).join("")}`).join("")}
<path d='M110 140c40-10 80 0 110 30M380 220c-40 0-70 20-90 50' stroke='#0f2a20' stroke-width='6' fill='none'/>
<path d='M90 150c20-20 50-24 70-14-24 4-44 12-70 14zM400 230c-20-20-50-24-70-14 24 4 44 12 70 14z' fill='#1d4a3a'/>
<path d='M262 196c60 0 150-20 220-60-40 50-110 90-200 100z' fill='#c8372d'/>
<path d='M268 214c50 20 120 30 190 10-50 40-130 50-196 24z' fill='#e0533f'/>
<ellipse cx='240' cy='206' rx='52' ry='58' fill='#081410'/>
<path d='M196 200h88' stroke='#c8372d' stroke-width='14'/>
<path d='M210 198l22 4M262 202l22-4' stroke='#e8f0fb' stroke-width='5' stroke-linecap='round'/>
<path d='M110 700c-10-140 30-260 130-290 100 30 150 150 140 290z' fill='#081410'/>
<path d='M330 470L440 400' stroke='#081410' stroke-width='40' stroke-linecap='round'/>
<path d='M440 400l40-34-14 44z' fill='#e8f0fb'/>
<path d='M190 176c8-14 22-22 38-24' stroke='#a7f0cf' stroke-width='3' fill='none' opacity='.8'/>`);

export const GENKAI = svg(`
<defs>
  <linearGradient id='a' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#2a1d0e'/><stop offset='.5' stop-color='#8a6a1f'/><stop offset='1' stop-color='#e6c35c'/></linearGradient>
  <radialGradient id='g' cx='50%' cy='50%' r='50%'><stop offset='0' stop-color='#fff6dc'/><stop offset='1' stop-color='#f2d88a' stop-opacity='0'/></radialGradient>
</defs>
<rect width='500' height='700' fill='url(#a)'/>
${Array.from({ length: 18 }, (_, i) => `<path d='M250 230L${250 + Math.cos((i / 18) * Math.PI * 2) * 600} ${230 + Math.sin((i / 18) * Math.PI * 2) * 600}' stroke='#fff1c4' stroke-width='14' opacity='.12'/>`).join("")}
<circle cx='250' cy='230' r='150' fill='url(#g)'/>
<path d='M120 690L150 90' stroke='#5a3a20' stroke-width='9' stroke-linecap='round'/>
<path d='M150 90c-26 4-40 30-30 52 10 22 40 26 56 10 18-18 10-60-26-62z' fill='none' stroke='#d9b556' stroke-width='6'/>
${[[118, 112], [128, 150], [176, 128], [170, 96]].map(([x, y]) => `<circle cx='${x}' cy='${y}' r='9' fill='none' stroke='#d9b556' stroke-width='4'/>`).join("")}
<ellipse cx='256' cy='214' rx='56' ry='62' fill='#1f1508'/>
<path d='M228 214c8 6 16 6 24 0M262 214c8 6 16 6 24 0' stroke='#f2d88a' stroke-width='4' fill='none' stroke-linecap='round'/>
<path d='M100 700c0-150 50-250 156-262 106 12 156 112 156 262z' fill='#1f1508'/>
<path d='M170 450c40 80 120 140 230 160l10 90H220c-30-80-60-160-50-250z' fill='#8e2018' opacity='.9'/>
${Array.from({ length: 11 }, (_, i) => `<circle cx='${200 + i * 11}' cy='${300 + Math.sin(i / 2) * 6 + i * 3}' r='6' fill='#5a3a20'/>`).join("")}
<path d='M206 186c8-16 26-26 44-28' stroke='#fff1c4' stroke-width='3' fill='none' opacity='.8'/>`);

export const KOHAKU = svg(`
<defs>
  <linearGradient id='a' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#120a24'/><stop offset='.55' stop-color='#4a3480'/><stop offset='1' stop-color='#b7a3e0'/></linearGradient>
  <radialGradient id='b' cx='50%' cy='60%' r='50%'><stop offset='0' stop-color='#ffffff'/><stop offset='.5' stop-color='#c9dcf3'/><stop offset='1' stop-color='#7fa3d1' stop-opacity='0'/></radialGradient>
</defs>
<rect width='500' height='700' fill='url(#a)'/>
${[[70, 140, 1], [420, 110, 0.8], [440, 330, 1.1], [60, 380, 0.9], [130, 560, 0.7], [400, 560, 0.8]].map(([x, y, k]) => `<path transform='translate(${x} ${y}) scale(${k})' d='M0 40c-22-14-22-44 0-64 4 18 18 22 18 40 0 14-8 24-18 24z' fill='url(#b)' opacity='.85'/>`).join("")}
${[-40, -10, 20, 50].map((r, i) => `<path transform='rotate(${r} 250 480)' d='M250 480c60-40 150-60 220-40-40 40-110 70-200 70z' fill='${["#e8f0fb", "#d4c6f0", "#f6f0ff", "#c9dcf3"][i]}' opacity='.92'/>`).join("")}
<path d='M200 170c4-60 20-96 34-110l18 60M300 170c-4-60-20-96-34-110l-18 60' fill='#f6f0ff'/>
<path d='M206 140c-30 40-40 120-30 200 10 80 0 200-20 360h188c-20-160-30-280-20-360 10-80 0-160-30-200z' fill='#e8e1f5'/>
<path d='M196 150c10-40 40-62 64-62s54 22 64 62c8 40-4 84-24 108h-80c-20-24-32-68-24-108z' fill='#f8f2e4'/>
<path d='M214 196c12-10 28-10 38 0M268 196c10-10 26-10 38 0' stroke='#c8372d' stroke-width='6' fill='none' stroke-linecap='round'/>
<path d='M240 236l20 14 20-14' fill='none' stroke='#15120f' stroke-width='5' stroke-linejoin='round'/>
<path d='M220 120l14 30M300 120l-14 30' stroke='#c8372d' stroke-width='5' stroke-linecap='round'/>
<circle cx='260' cy='146' r='6' fill='#d9b556'/>
<path d='M120 700c0-120 40-220 140-236 100 16 140 116 140 236z' fill='#2e1f52'/>
<path d='M190 470c30 40 110 40 140 0' stroke='#d9b556' stroke-width='5' fill='none'/>`);

export const SANDBOX_ART = { AKANE, TSUKIYO, KUROGANE, HAYATE, GENKAI, KOHAKU } as const;

/** Avatar du joueur du bac à sable : un soleil levant sur les monts, à l'encre. */
export const PLAYER_AVATAR = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'><defs><linearGradient id='a' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#2b1a10'/><stop offset='1' stop-color='#7d1a14'/></linearGradient></defs><rect width='80' height='80' fill='url(#a)'/><circle cx='40' cy='38' r='17' fill='#f2d88a'/><path d='M0 62L18 44L30 54L44 36L62 56L80 44V80H0Z' fill='#15120f'/><path d='M44 36L50 43L46 44L52 50' stroke='#f3ecdf' stroke-width='2' fill='none'/></svg>`,
)}`;
