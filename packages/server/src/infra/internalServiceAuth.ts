import { timingSafeEqual } from "node:crypto";

/** Check an internal service credential without exposing its value or timing comparisons. */
export function hasValidInternalServiceToken(suppliedValue: string | undefined, expectedValue: string) {
  if (Buffer.byteLength(expectedValue) < 32 || suppliedValue === undefined) return false;
  const supplied = Buffer.from(suppliedValue);
  const expected = Buffer.from(expectedValue);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
