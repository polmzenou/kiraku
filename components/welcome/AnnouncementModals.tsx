"use client";

import dynamic from "next/dynamic";

// Annonces de l'équipe, chargées à la demande. PlayerAnnouncements (dans le layout) les importait toutes : leur code,
// la fuda et le sachet du modal v2, la jauge et les règles du casino, partaient dans le JavaScript de chaque page
// (22 Ko sur l'accueil, la collection ou le marché ; 56 Ko, plus les 52 Ko de CSS de la fuda, sur une page sans
// carte), alors qu'un joueur en voit une au plus, une seule fois. Rendu serveur inchangé : le modal choisi arrive dans
// le HTML et son morceau est préchargé avec la page.
export const V1WelcomeModal = dynamic(() => import("./V1WelcomeModal").then((mod) => mod.V1WelcomeModal));
export const V2AnnouncementModal = dynamic(() => import("./V2AnnouncementModal").then((mod) => mod.V2AnnouncementModal));
export const CasinoAnnouncementModal = dynamic(() => import("../casino/CasinoAnnouncementModal").then((mod) => mod.CasinoAnnouncementModal));
export const EventGauge = dynamic(() => import("../home/EventGauge").then((mod) => mod.EventGauge));
