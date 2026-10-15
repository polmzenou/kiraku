// Kanji tracés en Yuji Syuku (sceaux, emblèmes, logo). La police est réduite
// à ces seuls caractères par scripts/subset-seal-font.mts : ajoute ici tout
// nouveau kanji de sceau, puis relance `npm run fonts:subset`.
export const SEAL_GLYPHS = [
  "並良稀秀金神", // raretés
  "気楽", // logo
  "新", // nouvelle carte
  "銭", // Zeni
  "力気", // stats
  "夜和紙墨朱藍", // thèmes et couleurs
  "一二三四五六七八九十百入枚", // contenance des sachets
  "福小重稀秀金神少青花麗異球機怖恋魔宙日笑心音姫侍主悪脇祝昔千新季星匠紙", // emblèmes des boosters
  "開封定番形稀少読者類人物時代特別", // titres de la page et des familles
  "選無料催事袋", // panneau, prix, composition du jūbako
  "管理", // administration
  "蒐集飾札公友秘願売", // collection, vitrine, fiche carte, confidentialité, souhaits, ventes
  "贈報", // cadeaux, notifications
  "任務商店招待済訪週", // missions, boutique, parrainage, réclamé, objectifs
  "戦対勝負引技気記法封", // combat : titres, victoire, défaite, nul, technique, orbes, historique, règles, sceau
  "挑発結界疾風毒反撃遺言復活", // passifs du combat
  "一閃貫通乱舞癒守護鼓封印", // techniques du combat
  "会心滅", // coup critique, carte hors combat
].join("");
