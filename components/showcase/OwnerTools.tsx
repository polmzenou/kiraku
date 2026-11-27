"use client";

import dynamic from "next/dynamic";

// Outils du propriétaire d'une vitrine, chargés à la demande. Importés tels quels par la page, leur code partait chez
// chaque visiteur d'une vitrine partagée, qui ne les affiche jamais : l'éditeur, Motion avec le glisser-déposer et
// la feuille de création, soit environ 160 Ko de JavaScript (60 Ko compressés) sur 190 propres à la page. Le rendu
// serveur reste le même pour le propriétaire : son HTML est complet et le morceau est préchargé avec la page.
export const ShowcaseEditor = dynamic(() => import("./ShowcaseEditor").then((mod) => mod.ShowcaseEditor));
export const CreateShowcaseButton = dynamic(() => import("./CreateShowcaseSheet").then((mod) => mod.CreateShowcaseButton));
