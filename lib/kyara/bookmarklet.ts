// Favori de l'équipe « Envoyer à Kiraku » (import Kyara, étape 17). Il s'exécute sur kyara.games, dans le navigateur
// d'un membre de l'équipe connecté au compte Kiraku : il lit la collection de l'ami (le joueur qui a demandé l'import),
// son profil public et, si besoin, les raretés du catalogue, puis ouvre /admin/kyara/recevoir#<lot>.
//   - Le jeton Kyara (localStorage.kyara_token) ne sert qu'aux requêtes vers kyara.games : il n'entre jamais dans le lot.
//   - Rien ne part sans le code de la demande (#kiraku=<code>), posé par « Traiter » dans la file de l'admin.
//   - Les routes de Kyara ne sont pas une API officielle (vues dans des projets tiers) : à confirmer par le test
//     du lot 0 (docs/KYARA-IMPORT.md), et BOOKMARKLET_BUILD à augmenter à chaque changement.
// Variante « console » : même code, qui affiche le lot au lieu d'ouvrir Kiraku (secours si un favori est bloqué).

export const BOOKMARKLET_BUILD = 1;

export type BookmarkletTexts = {
  /** Pas sur un profil kyara.games ouvert depuis « Traiter ». */
  wrongPage: string;
  /** Pas connecté à Kyara. */
  noToken: string;
  /** Titre de l'onglet pendant la lecture (« {n} » = cartes lues). */
  reading: string;
  /** Collection non visible pour le compte Kiraku (pas ami, ou « Montrer ma collection » coupé). */
  hidden: string;
  /** Autre échec (« {e} » = code d'erreur). */
  failed: string;
  /** Variante console : invite à copier le lot. */
  copy: string;
};

const PAGE_PAUSE_MS = 200;
const MAX_PAGES = 300;

/** Code JavaScript du favori, constantes injectées en JSON (aucune donnée de l'URL n'est interprétée comme du code). */
export function bookmarkletSource(o: { receiveUrl: string; texts: BookmarkletTexts; mode: "navigate" | "print" }): string {
  const constants = JSON.stringify({ r: o.receiveUrl, t: o.texts, b: BOOKMARKLET_BUILD, m: o.mode, w: PAGE_PAUSE_MS, x: MAX_PAGES });
  return `(async()=>{const K=${constants},T=K.t;
const m=location.pathname.match(/^\\/profil\\/([0-9a-fA-F-]{36})\\/?$/),n=(location.hash.match(/kiraku=([A-Za-z0-9_-]{43})/)||[])[1];
if(location.origin!=="https://kyara.games"||!m||!n){alert(T.wrongPage);return}
const tok=localStorage.getItem("kyara_token");if(!tok){alert(T.noToken);return}
const id=m[1].toLowerCase(),H={authorization:"Bearer "+tok};
const get=async(p,a)=>{const r=await fetch("/api"+p,a?{headers:H}:{});if(!r.ok)throw r.status;return r.json()};
const list=d=>Array.isArray(d)?d:(d&&(d.items||d.cards))||[];
try{
const prof=await get("/users/"+id,0);
const items=[];let total=null;
for(let page=1;page<=K.x;page++){const d=await get("/me/friends/"+id+"/collection?page="+page,1),it=list(d);items.push(...it);
if(d&&Number.isInteger(d.total))total=d.total;document.title=T.reading.replace("{n}",items.length);
if(!(d&&d.more)||it.length===0)break;await new Promise(r=>setTimeout(r,K.w))}
const rar={};if(items.some(i=>!i.rarity)){for(const c of list(await get("/characters",0)))rar[c.id]=c.rarity}
const c=items.map(i=>{const a=i.characterId??i.id;return[a,i.qty??i.quantity??1,i.rarity??rar[a]]}).filter(e=>Number.isInteger(e[0])&&e[0]>0&&Number.isInteger(e[1])&&e[1]>0&&/^[CURELM]$/.test(e[2]||""));
const json=JSON.stringify({v:1,b:K.b,k:id,n,p:typeof prof.pseudo==="string"?prof.pseudo:null,a:typeof prof.avatar==="string"?prof.avatar:null,r:new Date().toISOString(),t:total,c});
let bytes=new TextEncoder().encode(json),tag="v1";
if(typeof CompressionStream==="function"){bytes=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());tag="v1z"}
let bin="";for(let i=0;i<bytes.length;i+=32768)bin+=String.fromCharCode(...bytes.subarray(i,i+32768));
const frag=tag+"."+btoa(bin).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"");
if(K.m==="print"){console.log(frag);prompt(T.copy,frag)}else location.assign(K.r+"#"+frag)
}catch(e){alert(e===403||e===401?T.hidden:T.failed.replace("{e}",String(e)))}})();`;
}

/** Adresse du favori : « javascript: » + code encodé (un « # » brut couperait le favori). */
export function bookmarkletHref(source: string): string {
  return `javascript:${encodeURIComponent(source)}`;
}
