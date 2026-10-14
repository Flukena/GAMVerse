import { characterPortraitPreviewUrl } from "../../assets/characterPortraitPaths";
import { getRealtimeEndpoint } from "../../realtimeEndpoint";
import { portraitCropRect } from "./avatarPortraitGeometry";
import { PORTRAIT_EDGE_PX, queueAvatarSnapshot } from "./avatarPortraitSnapshot";

const PORTRAIT_CACHE_MAX_ENTRIES = 128;
const PORTRAIT_ATTEMPT_MAX_CHARACTER_IDS = 512;

export class AvatarPortraits {
  private readonly portraits = new Map<string, HTMLCanvasElement>();
  private readonly attempted = new Set<string>();
  private disposed = false;
  private readyFrameId: number | null = null;
  revision = 0;

  get(characterId: string | undefined): HTMLCanvasElement | null {
    if (!characterId || this.disposed) return null;
    const portrait = this.portraits.get(characterId);
    if (portrait) return portrait;
    if (this.attempted.has(characterId) || this.attempted.size >= PORTRAIT_ATTEMPT_MAX_CHARACTER_IDS) return null;
    this.attempted.add(characterId);
    const previewUrl = characterPortraitPreviewUrl(characterId);
    if (previewUrl) this.loadPreview(characterId, previewUrl);
    else queueAvatarSnapshot({
      characterId,
      endpoint: getRealtimeEndpoint(),
      active: () => !this.disposed,
      complete: (canvas) => { if (canvas) this.store(characterId, canvas); },
    });
    return null;
  }
  private loadPreview(characterId: string, url: string): void {
    const image = new Image();
    image.src = url;
    void image.decode().then(() => {
      if (this.disposed) return;
      const canvas = document.createElement("canvas");
      canvas.width = PORTRAIT_EDGE_PX;
      canvas.height = PORTRAIT_EDGE_PX;
      const crop = portraitCropRect(image.naturalWidth, image.naturalHeight);
      canvas.getContext("2d")?.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, PORTRAIT_EDGE_PX, PORTRAIT_EDGE_PX);
      this.store(characterId, canvas);
    }, () => { /* A missing preview retains the initials fallback without retrying. */ });
  }
  private store(characterId: string, portrait: HTMLCanvasElement): void {
    if (this.disposed) return;
    if (this.portraits.size >= PORTRAIT_CACHE_MAX_ENTRIES) {
      const oldestId = this.portraits.keys().next().value;
      if (oldestId !== undefined) this.portraits.delete(oldestId);
    }
    this.portraits.set(characterId, portrait);
    if (this.readyFrameId !== null) return;
    this.readyFrameId = requestAnimationFrame(() => {
      this.readyFrameId = null;
      this.revision += 1;
    });
  }
  dispose(): void {
    this.disposed = true;
    if (this.readyFrameId !== null) cancelAnimationFrame(this.readyFrameId);
    this.readyFrameId = null;
    this.portraits.clear();
    this.attempted.clear();
  }
}
