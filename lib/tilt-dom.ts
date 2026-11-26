// Inclinaison du téléphone (deviceorientation), partagée par tout l'écran : un seul écouteur et une seule image par
// frame pour toutes les fuda, le dos de carte et le booster de l'ouverture (une pile de 50 cartes n'en pose plus 50).
// iPhone (Safari, iOS 13 et plus) : les évènements n'arrivent qu'après DeviceOrientationEvent.requestPermission(),
// appelée pendant un geste du joueur (interrupteur de l'engrenage de l'ouverture). La réponse est mémorisée sur
// l'appareil ; l'écouteur n'est posé qu'une fois l'accès accordé.

/** x et y entre 0 et 1 environ (0,5 = téléphone tenu à ~45°, sans pencher), avant tout bornage. */
export type TiltListener = (x: number, y: number) => void;

/** Diffusé sur `window` quand la réponse à la demande d'accès change. */
export const TILT_EVENT = "kiraku:tilt";
const TILT_KEY = "kiraku:tilt";

/** La confirmation d'un accès déjà accordé est prévue (une fois par page). */
let resumeArmed = false;

type OrientationPermission = { requestPermission?: () => Promise<"granted" | "denied" | "default"> };
const permissionApi = (): OrientationPermission | null =>
  typeof DeviceOrientationEvent === "undefined" ? null : (DeviceOrientationEvent as unknown as OrientationPermission);

/** « unneeded » : navigateur qui livre l'inclinaison sans rien demander ; sinon la réponse mémorisée, ou « prompt ». */
export type TiltPermission = "unneeded" | "prompt" | "granted" | "denied";

export function tiltPermission(): TiltPermission {
  if (typeof permissionApi()?.requestPermission !== "function") return "unneeded";
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(TILT_KEY);
  } catch {
    // Stockage bloqué (navigation privée) : on redemandera
  }
  return stored === "granted" || stored === "denied" ? stored : "prompt";
}

function remember(answer: "granted" | "denied") {
  try {
    localStorage.setItem(TILT_KEY, answer);
  } catch {
    // Stockage bloqué : la réponse vaut pour cette page seulement
  }
  window.dispatchEvent(new Event(TILT_EVENT));
}

/**
 * Demande l'accès à l'inclinaison (iPhone), à appeler dans le gestionnaire d'un geste (clic, toucher) : Safari
 * refuse la demande hors geste. Vrai si l'inclinaison est disponible.
 */
export async function requestTiltPermission(): Promise<boolean> {
  const request = permissionApi()?.requestPermission;
  if (typeof request !== "function") return true;
  // Demandée sur cette page : pas besoin de la reconfirmer au premier geste
  resumeArmed = true;
  let granted = false;
  try {
    granted = (await request.call(DeviceOrientationEvent)) === "granted";
  } catch {
    granted = false;
  }
  remember(granted ? "granted" : "denied");
  return granted;
}

const listeners = new Set<TiltListener>();
let frame = 0;
let tiltX = 0.5;
let tiltY = 0.5;
let attached = false;

const flush = () => {
  frame = 0;
  for (const listener of listeners) listener(tiltX, tiltY);
};
// gamma : gauche/droite (−90…90), beta : avant/arrière (−180…180), autour d'une tenue à ~45°
const onOrientation = (e: DeviceOrientationEvent) => {
  if (e.gamma === null || e.beta === null) return;
  tiltX = 0.5 + e.gamma / 60;
  tiltY = 0.5 + (e.beta - 45) / 60;
  if (!frame) frame = requestAnimationFrame(flush);
};

function detach() {
  if (!attached) return;
  attached = false;
  window.removeEventListener("deviceorientation", onOrientation);
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
}

function attach() {
  const permission = tiltPermission();
  if (listeners.size === 0 || permission === "prompt" || permission === "denied") return detach();
  if (attached) return;
  attached = true;
  window.addEventListener("deviceorientation", onOrientation, { passive: true });
  // Accès déjà accordé sur cet iPhone : Safari peut demander de le confirmer à chaque page, ce que l'on fait au
  // premier geste (sans fenêtre si Safari s'en souvient)
  if (permission === "granted" && !resumeArmed) {
    resumeArmed = true;
    const resume = () => {
      window.removeEventListener("click", resume, true);
      window.removeEventListener("touchend", resume, true);
      void requestTiltPermission();
    };
    window.addEventListener("click", resume, true);
    window.addEventListener("touchend", resume, true);
  }
}

// Nouvelle réponse : l'écouteur est reposé (ou retiré si l'accès est refusé)
const onPermission = () => {
  detach();
  attach();
};
let watching = false;
/** Abonne `listener` à l'inclinaison ; renvoie le désabonnement. */
export function listenTilt(listener: TiltListener): () => void {
  if (!watching) {
    watching = true;
    window.addEventListener(TILT_EVENT, onPermission);
  }
  listeners.add(listener);
  attach();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) detach();
  };
}
