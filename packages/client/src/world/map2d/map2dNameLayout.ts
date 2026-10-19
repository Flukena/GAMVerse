export type Map2dNameRect = { leftPx: number; topPx: number; widthPx: number; heightPx: number };
export type Map2dNameCandidate = {
  sessionId: string; text: string; xPx: number; topPx: number; widthPx: number; heightPx: number;
  local: boolean; speaking: boolean; handRaised: boolean;
};
export type Map2dNamePlacement = Map2dNameRect & { sessionId: string; text: string };
type Viewport = { widthPx: number; heightPx: number };
const NAME_COLLISION_GAP_PX = 3;
const LOCAL_NAME_PRIORITY = 3;
const SPEAKING_NAME_PRIORITY = 2;
const RAISED_NAME_PRIORITY = 1;
const ORDINARY_NAME_PRIORITY = 0;
const NAME_ELLIPSIS = "…";

export function fitMap2dName(text: string, maxWidthPx: number, measure: (text: string) => number): string {
  if (measure(text) <= maxWidthPx) return text;
  const characters = Array.from(text);
  while (characters.length > 0) {
    characters.pop();
    const fitted = characters.join("") + NAME_ELLIPSIS;
    if (measure(fitted) <= maxWidthPx) return fitted;
  }
  return measure(NAME_ELLIPSIS) <= maxWidthPx ? NAME_ELLIPSIS : "";
}
function namePriority(candidate: Map2dNameCandidate): number {
  if (candidate.local) return LOCAL_NAME_PRIORITY;
  if (candidate.speaking) return SPEAKING_NAME_PRIORITY;
  return candidate.handRaised ? RAISED_NAME_PRIORITY : ORDINARY_NAME_PRIORITY;
}
function compareCandidates(a: Map2dNameCandidate, b: Map2dNameCandidate): number {
  const priority = namePriority(b) - namePriority(a);
  if (priority !== 0) return priority;
  if (a.sessionId < b.sessionId) return -1;
  return a.sessionId === b.sessionId ? 0 : 1;
}
function overlaps(a: Map2dNameRect, b: Map2dNameRect, gapPx = NAME_COLLISION_GAP_PX): boolean {
  return a.leftPx < b.leftPx + b.widthPx + gapPx &&
    a.leftPx + a.widthPx + gapPx > b.leftPx &&
    a.topPx < b.topPx + b.heightPx + gapPx &&
    a.topPx + a.heightPx + gapPx > b.topPx;
}
function placeCandidate(candidate: Map2dNameCandidate, viewport: Viewport): Map2dNamePlacement | undefined {
  if (candidate.xPx < 0 || candidate.xPx > viewport.widthPx || candidate.topPx + candidate.heightPx < 0 ||
    candidate.topPx > viewport.heightPx || candidate.widthPx > viewport.widthPx || candidate.heightPx > viewport.heightPx) return undefined;
  return {
    sessionId: candidate.sessionId, text: candidate.text, widthPx: candidate.widthPx, heightPx: candidate.heightPx,
    leftPx: Math.max(0, Math.min(viewport.widthPx - candidate.widthPx, candidate.xPx - candidate.widthPx / 2)),
    topPx: Math.max(0, Math.min(viewport.heightPx - candidate.heightPx, candidate.topPx)),
  };
}
/** Stable priority keeps dense scenes readable without hiding avatar/status geometry. */
export function layoutMap2dNames(candidates: readonly Map2dNameCandidate[], viewport: Viewport,
  obstacles: readonly Map2dNameRect[] = []): Map2dNamePlacement[] {
  const placed: Map2dNamePlacement[] = [];
  for (const candidate of [...candidates].sort(compareCandidates)) {
    const label = placeCandidate(candidate, viewport);
    if (!label || obstacles.some(obstacle => overlaps(label, obstacle, 0)) || placed.some(other => overlaps(label, other))) continue;
    placed.push(label);
  }
  return placed;
}
