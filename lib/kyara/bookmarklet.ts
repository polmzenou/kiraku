import { KYARA_PAYLOAD_VERSION } from "./codes";

// Favori de l'équipe « Envoyer à Kiraku » (import Kyara, étape 17). Il s'exécute sur kyara.games, dans le navigateur
// d'un membre de l'équipe connecté au compte Kiraku, sur le profil d'un ami (un joueur qui a demandé l'import) : il lit
// sa collection, son profil public et, si besoin, les raretés du catalogue, puis ouvre /admin/kyara/recevoir#<lot>.
//   - Le jeton Kyara (localStorage.kyara_token) ne sert qu'aux requêtes vers kyara.games : il n'entre jamais dans le lot.
//   - Chaque membre de l'équipe a son favori, avec sa clé (« Générer mon favori » sur /admin/kyara) : un lot fabriqué
//     ailleurs (lien piégé vers la page de réception) n'a pas la clé et est refusé. Générer à nouveau change la clé.
//   - Les routes de Kyara ne sont pas une API officielle (vues dans des projets tiers et à l'essai du 22/11,
//     docs/KYARA-IMPORT.md) : BOOKMARKLET_BUILD à augmenter à chaque changement.
// Variante « console » : même code, qui affiche le lot au lieu d'ouvrir Kiraku (secours si un favori est bloqué).
// Profil ouvert = compte Kyara connecté (essai avec un seul compte) : la collection est lue par /api/me/collection.
// Être ami ne suffit pas : Kyara répond 403 « not_shared » tant que le joueur n'a pas cliqué « Montrer ma collection »
// dans sa conversation avec le compte Kiraku (essai du 23/11 en production). Un refus affiche la raison de Kyara.
// Rien n'est affaibli : le lot n'est accepté qu'avec la clé du membre connecté à Kiraku et le même compte Discord.

export const BOOKMARKLET_BUILD = 3;

export type BookmarkletTexts = {
  /** Pas sur un profil kyara.games. */
  wrongPage: string;
  /** Pas connecté à Kyara. */
  noToken: string;
  /** Titre de l'onglet pendant la lecture (« {n} » = cartes lues). */
  reading: string;
  /** Collection non visible pour le compte Kiraku (pas ami, autre refus) ; la raison de Kyara est ajoutée entre parenthèses. */
  hidden: string;
  /** Kyara répond « not_shared » : ami, mais « Montrer ma collection » pas encore cliqué dans la conversation. */
  notShared: string;
  /** Autre échec (« {e} » = code d'erreur). */
  failed: string;
  /** Variante console : invite à copier le lot. */
  copy: string;
};

const PAGE_PAUSE_MS = 200;
const MAX_PAGES = 300;

/** Code JavaScript du favori, constantes injectées en JSON (aucune donnée de l'URL n'est interprétée comme du code). */
export function bookmarkletSource(o: { receiveUrl: string; staffKey: string; texts: BookmarkletTexts; mode: "navigate" | "print" }): string {
  const constants = JSON.stringify({
    r: o.receiveUrl,
    s: o.staffKey,
    t: o.texts,
    b: BOOKMARKLET_BUILD,
    v: KYARA_PAYLOAD_VERSION,
    m: o.mode,
    w: PAGE_PAUSE_MS,
    x: MAX_PAGES,
  });
  return `(async()=>{const K=${constants},T=K.t;
const m=location.pathname.match(/^\\/profil\\/([0-9a-fA-F-]{36})\\/?$/);
if(location.origin!=="https://kyara.games"||!m){alert(T.wrongPage);return}
const tok=localStorage.getItem("kyara_token");if(!tok){alert(T.noToken);return}
const id=m[1].toLowerCase(),H={authorization:"Bearer "+tok};
const get=async(p,a)=>{const r=await fetch("/api"+p,a?{headers:H}:{});if(!r.ok){let b=null;try{b=await r.json()}catch(e){}throw{s:r.status,c:b&&b.error,m:b&&b.message}}return r.json()};
const list=d=>Array.isArray(d)?d:(d&&(d.items||d.cards))||[];
try{
const prof=await get("/users/"+id,0);
let path="/me/friends/"+id+"/collection?";
try{const me=await get("/me",1);if(String(me.id??(me.user&&me.user.id)??"").toLowerCase()===id)path="/me/collection?lean=1&"}catch(e){}
const items=[];let total=null;
for(let page=1;page<=K.x;page++){const d=await get(path+"page="+page,1),it=list(d);items.push(...it);
if(d&&Number.isInteger(d.total))total=d.total;document.title=T.reading.replace("{n}",items.length);
if(!(d&&d.more)||it.length===0)break;await new Promise(r=>setTimeout(r,K.w))}
const rar={};if(items.some(i=>!i.rarity)){for(const c of list(await get("/characters",0)))rar[c.id]=c.rarity}
const c=items.map(i=>{const a=i.characterId??i.id;return[a,i.qty??i.quantity??1,i.rarity??rar[a]]}).filter(e=>Number.isInteger(e[0])&&e[0]>0&&Number.isInteger(e[1])&&e[1]>0&&/^[CURELM]$/.test(e[2]||""));
const json=JSON.stringify({v:K.v,b:K.b,k:id,s:K.s,p:typeof prof.pseudo==="string"?prof.pseudo:null,a:typeof prof.avatar==="string"?prof.avatar:null,r:new Date().toISOString(),t:total,c});
let bytes=new TextEncoder().encode(json),tag="v"+K.v;
if(typeof CompressionStream==="function"){bytes=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());tag+="z"}
let bin="";for(let i=0;i<bytes.length;i+=32768)bin+=String.fromCharCode(...bytes.subarray(i,i+32768));
const frag=tag+"."+btoa(bin).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"");
if(K.m==="print"){console.log(frag);prompt(T.copy,frag)}else location.assign(K.r+"#"+frag)
}catch(e){const s=e&&e.s,c=e&&typeof e.c==="string"?e.c:"",w=e&&typeof e.m==="string"?" ("+e.m.slice(0,200)+")":"";
alert(c==="not_shared"?T.notShared:s===403||s===401?T.hidden+w:T.failed.replace("{e}",String(s??e)+(c?" · "+c:"")))}})();`;
}

/** Adresse du favori : « javascript: » + code encodé (un « # » brut couperait le favori). */
export function bookmarkletHref(source: string): string {
  return `javascript:${encodeURIComponent(source)}`;
}
