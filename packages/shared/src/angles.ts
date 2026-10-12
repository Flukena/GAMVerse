export const FULL_TURN_RAD = 2 * Math.PI;

/** Signed shortest turn in [-π, π], including angles outside one revolution. */
export function shortestAngleDelta(from: number, to: number): number {
  const delta = (to - from) % FULL_TURN_RAD;
  if (delta > Math.PI) return delta - FULL_TURN_RAD;
  if (delta < -Math.PI) return delta + FULL_TURN_RAD;
  return delta;
}

export function lerpAngle(from: number, to: number, t: number): number {
  return from + shortestAngleDelta(from, to) * t;
}
