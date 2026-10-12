import { MathUtils } from "three";
import { cameraSmoothingFactor } from "./cameraPose";

type SpringArmInput = {
  desired: number;
  hit: number | null;
  padding: number;
  min: number;
  previous: number | null;
  deltaSec: number;
};

export function resolveSpringArmDistance(input: SpringArmInput): number {
  const { desired, hit, padding, min, previous, deltaSec } = input;
  const limitM = Math.max(min, hit === null ? desired : Math.min(desired, hit - padding));
  if (previous === null || limitM <= previous) return limitM;
  return MathUtils.lerp(previous, limitM, cameraSmoothingFactor(deltaSec));
}
