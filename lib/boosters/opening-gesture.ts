export type OpeningGesture = {
  x: number;
  y: number;
  distance: number;
  vertical: boolean;
  direction: 1 | -1;
};

/** La coupe part du côté touché et fonctionne dans les deux sens. */
export function startOpeningGesture(x: number, y: number, rect: { left: number; width: number; height: number }, vertical: boolean): OpeningGesture {
  const start = Math.min(rect.width, Math.max(0, x - rect.left));
  const direction = start <= rect.width / 2 ? 1 : -1;
  return {
    x,
    y,
    vertical,
    direction,
    distance: Math.max(1, vertical ? rect.height * 0.45 : Math.max(rect.width * 0.45, direction === 1 ? rect.width - start : start) * 0.9),
  };
}

export function openingGestureProgress(gesture: OpeningGesture, x: number, y: number): number {
  const dx = x - gesture.x;
  const dy = y - gesture.y;
  // Un mouvement vertical sur la bande n'est pas une coupe.
  if (!gesture.vertical && Math.abs(dy) > Math.abs(dx) * 0.8) return 0;
  const travel = gesture.vertical ? -dy : dx * gesture.direction;
  return Math.min(1, Math.max(0, travel / gesture.distance));
}
