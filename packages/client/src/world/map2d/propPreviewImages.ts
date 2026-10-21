import { roomPropPreviewUrl } from "../../assets/roomPropPaths";
import type { RoomPropDefinition } from "@gammyverse/shared";
import { PROP_TOPDOWN_ASSETS } from "./propTopdownAssets";

export function hasTopdownPropImage(definition: RoomPropDefinition | undefined): boolean {
  return Boolean(definition && (definition.vehicleId || definition.editorRole === "building-prefab" || PROP_TOPDOWN_ASSETS.has(definition.asset)));
}

/** Shared by the play map and minimap. Failed URLs are retained to avoid retries. */
class PropPreviewImages {
  private readonly images = new Map<string, HTMLImageElement | null>();
  private batchPending = false;
  private pendingLoads = 0;
  private loadedInBatch = false;
  revision = 0;
  get(definition: RoomPropDefinition | undefined): HTMLImageElement | null {
    const url = definition && PROP_TOPDOWN_ASSETS.has(definition.asset)
      ? `/assets/map2d-props/${definition.asset}.png`
      : definition?.vehicleId || definition?.editorRole === "building-prefab"
      ? definition.asset.startsWith("external-cozy-home-interiors-")
        ? `/assets/external/cozy-home-interiors/Map2D/${definition.asset}.png`
        : definition.preview?.replace(/\/Previews\/[^/]+\.png$/, `/Map2D/${definition.asset}.png`)
      : definition ? roomPropPreviewUrl(definition) : undefined;
    if (!url) return null;
    if (this.images.has(url)) return this.images.get(url) ?? null;
    this.images.set(url, null);
    this.pendingLoads += 1;
    const image = new Image();
    image.src = url;
    void image.decode().then(() => {
      this.images.set(url, image);
      this.loadedInBatch = true;
      this.finishLoad();
    }, () => { this.finishLoad(); });
    return null;
  }
  private finishLoad(): void {
    this.pendingLoads -= 1;
    if (this.pendingLoads || !this.loadedInBatch) return;
    this.invalidateBatch();
  }
  private invalidateBatch(): void {
    if (this.batchPending) return;
    this.batchPending = true;
    requestAnimationFrame(() => {
      this.batchPending = false;
      if (this.pendingLoads) return;
      this.loadedInBatch = false;
      this.revision += 1;
    });
  }
}
export const propPreviewImages = new PropPreviewImages();
