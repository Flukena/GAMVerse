import type { LocalVideoTrack } from "livekit-client";
import type { BackgroundProcessorWrapper } from "@livekit/track-processors";

export type CameraBackgroundMode = "off" | "blur" | "image";

export const CAMERA_BACKGROUND_STORAGE_KEY = "gammyverse.cameraBackground.v1";
export const CAMERA_BACKGROUND_IMAGE = "/assets/video-backgrounds/soft-office.svg";
const backgroundProcessors = new WeakMap<LocalVideoTrack, BackgroundProcessorWrapper>();

export function readCameraBackgroundMode(): CameraBackgroundMode {
  try {
    const stored = globalThis.localStorage?.getItem(CAMERA_BACKGROUND_STORAGE_KEY);
    return stored === "blur" || stored === "image" ? stored : "off";
  } catch {
    return "off";
  }
}

export function saveCameraBackgroundMode(mode: CameraBackgroundMode): void {
  try { globalThis.localStorage?.setItem(CAMERA_BACKGROUND_STORAGE_KEY, mode); }
  catch { /* Keep the selected effect for this session if storage is unavailable. */ }
}

export async function applyCameraBackgroundMode(
  track: LocalVideoTrack,
  mode: CameraBackgroundMode,
): Promise<void> {
  let processor = backgroundProcessors.get(track);
  if (mode === "off" && !processor) return;
  const { BackgroundProcessor, supportsBackgroundProcessors } = await import("@livekit/track-processors");
  if (!supportsBackgroundProcessors()) {
    throw new Error("Background effects are not supported by this browser.");
  }
  if (!processor) {
    processor = BackgroundProcessor({ mode: "disabled" });
    await track.setProcessor(processor);
    backgroundProcessors.set(track, processor);
  }

  if (mode === "blur") {
    await processor.switchTo({ mode: "background-blur", blurRadius: 12 });
  } else if (mode === "image") {
    await processor.switchTo({ mode: "virtual-background", imagePath: CAMERA_BACKGROUND_IMAGE });
  } else {
    await processor.switchTo({ mode: "disabled" });
  }
}
