/** Chargement différé de domMax (~25 ko) : la page s'affiche sans attendre le glisser-déposer. */
export const loadDomMax = () => import("./dom-max").then((mod) => mod.default);
