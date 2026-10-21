export const ROADSIDE_CHUNK_SIZE_M = 64;
export const ROADSIDE_RENDER_DISTANCE_M = 100;
export const ROADSIDE_RENDER_HYSTERESIS_M = 15;

type Position = { x: number; z: number };
type RoadsidePlacement = Position & { id: string; width: number; depth: number; rotation: number };
export type RoadsideBounds = { minX: number; maxX: number; minZ: number; maxZ: number };
export type RoadsideChunk<Prop> = { key: string; bounds: RoadsideBounds; props: Prop[] };

/** Every layout prop is chunked; in the public zone the character, not the camera, decides what is drawn. */
export function groupRoadsideProps<Prop extends RoadsidePlacement>(props: readonly Prop[]): RoadsideChunk<Prop>[] {
  const chunks = new Map<string, RoadsideChunk<Prop>>();
  for (const prop of props) {
    const key = `${Math.floor(prop.x / ROADSIDE_CHUNK_SIZE_M)},${Math.floor(prop.z / ROADSIDE_CHUNK_SIZE_M)}`;
    let chunk = chunks.get(key);
    if (!chunk) {
      chunk = { key, bounds: { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }, props: [] };
      chunks.set(key, chunk);
    }
    const cosine = Math.abs(Math.cos(prop.rotation));
    const sine = Math.abs(Math.sin(prop.rotation));
    const halfWidth = (cosine * prop.width + sine * prop.depth) / 2;
    const halfDepth = (sine * prop.width + cosine * prop.depth) / 2;
    chunk.bounds.minX = Math.min(chunk.bounds.minX, prop.x - halfWidth);
    chunk.bounds.maxX = Math.max(chunk.bounds.maxX, prop.x + halfWidth);
    chunk.bounds.minZ = Math.min(chunk.bounds.minZ, prop.z - halfDepth);
    chunk.bounds.maxZ = Math.max(chunk.bounds.maxZ, prop.z + halfDepth);
    chunk.props.push(prop);
  }
  return [...chunks.values()];
}

export function shouldRenderRoadsideChunk(
  bounds: RoadsideBounds,
  character: Position | undefined,
  wasVisible: boolean,
  cameraRoomKey: string,
  editing: boolean,
) {
  if (editing || cameraRoomKey !== "lobby" || !character) return true;
  const dx = Math.max(bounds.minX - character.x, 0, character.x - bounds.maxX);
  const dz = Math.max(bounds.minZ - character.z, 0, character.z - bounds.maxZ);
  const radius = ROADSIDE_RENDER_DISTANCE_M + (wasVisible ? ROADSIDE_RENDER_HYSTERESIS_M : 0);
  return dx * dx + dz * dz <= radius * radius;
}

export class RoadsideSceneryVisibility {
  private readonly chunks;
  private readonly chunkByPropId;
  private readonly propStates = new Map<string, { bounds: RoadsideBounds; visible: boolean }>();
  private readonly instanceListeners = new Set<{ ids: readonly string[]; apply: (visible: boolean[]) => void; last: string }>();
  private active = false;

  constructor(props: readonly RoadsidePlacement[]) {
    this.chunks = groupRoadsideProps(props).map(chunk => ({ ...chunk, visible: false, visuals: new Set<{ visible: boolean }>() }));
    this.chunkByPropId = new Map(this.chunks.flatMap(chunk => chunk.props.map(prop => [prop.id, chunk] as const)));
    for (const chunk of this.chunks) for (const prop of chunk.props) this.propStates.set(prop.id, { bounds: groupRoadsideProps([prop])[0].bounds, visible: false });
  }

  update(character: Position | undefined, cameraRoomKey: string, editing: boolean) {
    this.active = Boolean(character && cameraRoomKey === "lobby" && !editing);
    for (const chunk of this.chunks) {
      const chunkVisible = shouldRenderRoadsideChunk(chunk.bounds, character, chunk.visible, cameraRoomKey, editing);
      let anyVisible = false;
      for (const prop of chunk.props) {
        const state = this.propStates.get(prop.id)!;
        state.visible = chunkVisible && shouldRenderRoadsideChunk(state.bounds, character, state.visible, cameraRoomKey, editing);
        anyVisible ||= state.visible;
      }
      chunk.visible = this.active ? anyVisible : chunkVisible;
      for (const visual of chunk.visuals) visual.visible = chunk.visible;
    }
    for (const listener of this.instanceListeners) this.notify(listener);
  }

  visibilityFor(propId: string): boolean | undefined {
    return this.active ? this.propStates.get(propId)?.visible : undefined;
  }

  /** Reports per-prop visibility to a batch whenever it changes, so instances beyond the radius are not drawn. */
  registerInstances(ids: readonly string[], apply: (visible: boolean[]) => void) {
    const listener = { ids, apply, last: "" };
    this.instanceListeners.add(listener);
    this.notify(listener);
  }

  private notify(listener: { ids: readonly string[]; apply: (visible: boolean[]) => void; last: string }) {
    const flags = listener.ids.map(id => this.visibilityFor(id) ?? true);
    const key = flags.map(flag => (flag ? "1" : "0")).join("");
    if (key === listener.last) return;
    listener.last = key;
    listener.apply(flags);
  }

  registerVisual(propId: string, visual: { visible: boolean }) {
    const chunk = this.chunkByPropId.get(propId);
    if (!chunk) return;
    chunk.visuals.add(visual);
    visual.visible = this.active ? chunk.visible : true;
  }

  splitInstancedProps<Prop extends { id: string }>(props: readonly Prop[]): Prop[][] {
    const groups = new Map<string, Prop[]>();
    for (const prop of props) {
      const key = this.chunkByPropId.get(prop.id)?.key ?? "unculled";
      const group = groups.get(key) ?? [];
      group.push(prop);
      groups.set(key, group);
    }
    return [...groups.values()];
  }
}