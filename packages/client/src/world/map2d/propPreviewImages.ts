import { roomPropPreviewUrl } from "../../assets/roomPropPaths";
import type { RoomPropDefinition } from "@gammyverse/shared";

/** Shared by the play map and minimap. Failed URLs are retained to avoid retries. */
class PropPreviewImages {
  private readonly images = new Map<string, HTMLImageElement | null>();
  private batchPending = false;
  private pendingLoads = 0;
  private loadedInBatch = false;
  revision = 0;
  get(definition: RoomPropDefinition | undefined): HTMLImageElement | null {
    const url = definition ? roomPropPreviewUrl(definition) : undefined;
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
