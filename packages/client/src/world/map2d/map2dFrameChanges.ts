import type { RoomLayout } from "@gammyverse/shared";
import type { Map2dDecoration } from "./map2dDynamicLayer";
import type { Map2dPoint, Map2dProjection } from "./map2dProjection";

import type { Map2dPresentation } from "./map2dPresentation";

type FrameInputs = {
  presentation?: Map2dPresentation;
  layout: RoomLayout | null;
  configVersion: number;
  widthM: number;
  depthM: number;
  view: "2d" | "3d";
  localId: string | null;
  following?: boolean;
  destination?: Map2dPoint | null;
  speaking: ReadonlySet<string>;
  decorations: readonly Map2dDecoration[];
  nowMs: number;
};
export function writeMap2dFollowProjection(output: Map2dProjection, input: Map2dProjection,
  following: boolean, local: Map2dPoint | undefined): void {
  const center = following && local ? local : input.center;
  output.center.x = center.x;
  output.center.z = center.z;
  output.pxPerM = input.pxPerM;
  output.widthPx = input.widthPx;
  output.heightPx = input.heightPx;
  output.dpr = input.dpr;
}
function sameProjection(a: Map2dProjection, b: Map2dProjection): boolean {
  return a.center.x === b.center.x && a.center.z === b.center.z && a.pxPerM === b.pxPerM &&
    a.widthPx === b.widthPx && a.heightPx === b.heightPx && a.dpr === b.dpr;
}
function sameSpeaking(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const name of a) if (!b.has(name)) return false;
  return true;
}
function sameDecoration(a: Map2dDecoration, b: Map2dDecoration): boolean {
  return a.sessionId === b.sessionId && a.text === b.text && a.expiresAtMs === b.expiresAtMs;
}
export class Map2dFrameChanges {
  private invalidated = true;
  private readonly projection: Map2dProjection = { center: { x: 0, z: 0 }, pxPerM: 0, widthPx: 0, heightPx: 0, dpr: 1 };
  private presentation: Map2dPresentation | undefined;
  private layout: RoomLayout | null = null;
  private configVersion = 0;
  private widthM = 0;
  private depthM = 0;
  private view: "2d" | "3d" = "2d";
  private localId: string | null = null;
  private following = false;
  private staticRevision = 0;
  private portraitRevision = 0;
  private destinationX: number | undefined;
  private destinationZ: number | undefined;
  private readonly speaking = new Set<string>();
  readonly activeDecorations: Map2dDecoration[] = [];
  invalidate(): void { this.invalidated = true; }
  private sceneChanged(input: FrameInputs): boolean {
    const changed = this.presentation !== input.presentation || this.layout !== input.layout || this.configVersion !== input.configVersion ||
      this.widthM !== input.widthM || this.depthM !== input.depthM || this.view !== input.view ||
      this.localId !== input.localId || this.following !== Boolean(input.following);
    this.presentation = input.presentation;
    this.layout = input.layout;
    this.configVersion = input.configVersion;
    this.widthM = input.widthM;
    this.depthM = input.depthM;
    this.view = input.view;
    this.localId = input.localId;
    this.following = Boolean(input.following);
    return changed;
  }
  private destinationChanged(destination: Map2dPoint | null | undefined): boolean {
    const changed = this.destinationX !== destination?.x || this.destinationZ !== destination?.z;
    this.destinationX = destination?.x;
    this.destinationZ = destination?.z;
    return changed;
  }
  private speakingChanged(input: ReadonlySet<string>): boolean {
    if (sameSpeaking(this.speaking, input)) return false;
    this.speaking.clear();
    for (const name of input) this.speaking.add(name);
    return true;
  }
  private decorationsChanged(input: readonly Map2dDecoration[], nowMs: number): boolean {
    let count = 0;
    let changed = false;
    for (const decoration of input) {
      if (decoration.expiresAtMs <= nowMs) continue;
      const previous = this.activeDecorations[count];
      if (!previous) this.activeDecorations.push({ ...decoration });
      else if (!sameDecoration(previous, decoration)) {
        previous.sessionId = decoration.sessionId;
        previous.text = decoration.text;
        previous.expiresAtMs = decoration.expiresAtMs;
        changed = true;
      }
      count += 1;
    }
    changed ||= count !== this.activeDecorations.length;
    this.activeDecorations.length = count;
    return changed || count > 0;
  }
  update(input: FrameInputs, projection: Map2dProjection, staticRevision: number, portraitRevision: number): boolean {
    let changed = this.invalidated;
    this.invalidated = false;
    changed = this.sceneChanged(input) || changed;
    changed = !sameProjection(this.projection, projection) || changed;
    writeMap2dFollowProjection(this.projection, projection, false, undefined);
    changed = this.destinationChanged(input.destination) || changed;
    changed = this.speakingChanged(input.speaking) || changed;
    changed = this.decorationsChanged(input.decorations, input.nowMs) || changed;
    changed = this.staticRevision !== staticRevision || this.portraitRevision !== portraitRevision || changed;
    this.staticRevision = staticRevision;
    this.portraitRevision = portraitRevision;
    return changed;
  }
}
