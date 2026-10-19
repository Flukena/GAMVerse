import { DEFAULT_MEDIA_DEVICE_ID, MEDIA_DEVICE_KINDS, browserDeviceStorage, persistMediaDevicePreferences, readMediaDevicePreferences, type DevicePreferenceStorage, type MediaDevicePreferences } from "./mediaDevicePreferences";
export { applyMediaDevicePreferences, readMediaDevicePreferences } from "./mediaDevicePreferences";
export type { MediaDevicePreferences } from "./mediaDevicePreferences";

export type MediaDeviceEntry = Pick<MediaDeviceInfo, "kind" | "deviceId" | "label">;
export interface MediaDeviceSnapshot {
  devices: MediaDeviceEntry[];
  preferences: MediaDevicePreferences;
  preview: MediaStream | null;
  busy: boolean;
  error: string | null;
  speakerSelectionSupported: boolean;
}
export interface MediaDeviceAdapter {
  enumerateDevices(): Promise<MediaDeviceEntry[]>;
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  onDeviceChange(listener: () => void): () => void;
  speakerSelectionSupported: boolean;
}
const DEVICE_UNAVAILABLE_LABEL = "Media devices are unavailable in this browser.";
const DEVICE_PERMISSION_LABEL = "Camera or microphone permission was denied. Allow access in your browser, then retry.";
const DEVICE_CAPTURE_LABEL = "Could not open the selected device. Check that it is connected, then retry.";
const DEVICE_ENUMERATION_LABEL = "Could not list media devices. Check browser permissions, then retry.";
const DEVICE_UNPLUGGED_LABEL = "A preview device disconnected. Choose another device and restart preview.";

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach(track => track.stop());
}
function deviceConstraint(deviceId: string): MediaTrackConstraints {
  return deviceId === DEFAULT_MEDIA_DEVICE_ID ? {} : { deviceId: { exact: deviceId } };
}
function captureError(cause: unknown): string {
  return cause instanceof Error && cause.name === "NotAllowedError" ? DEVICE_PERMISSION_LABEL : DEVICE_CAPTURE_LABEL;
}

/** Owns local preview only. It never creates a room or publishes a track. */
export class MediaDeviceController {
  private state: MediaDeviceSnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly detachDeviceChange: () => void;
  private detachPreview: (() => void) | null = null;
  private previewGeneration = 0;
  private enumerationGeneration = 0;
  private disposed = false;

  constructor(private readonly adapter: MediaDeviceAdapter, private readonly storage?: DevicePreferenceStorage) {
    this.state = { devices: [], preferences: readMediaDevicePreferences(storage), preview: null, busy: false, error: null, speakerSelectionSupported: adapter.speakerSelectionSupported };
    this.detachDeviceChange = adapter.onDeviceChange(() => { void this.refresh(); });
  }
  get snapshot(): MediaDeviceSnapshot { return this.state; }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  private publish(update: Partial<MediaDeviceSnapshot>): void {
    if (this.disposed) return;
    this.state = { ...this.state, ...update };
    this.listeners.forEach(listener => listener());
  }
  async refresh(): Promise<void> {
    if (this.disposed) return;
    const generation = ++this.enumerationGeneration;
    try {
      const devices = await this.adapter.enumerateDevices();
      if (this.disposed || generation !== this.enumerationGeneration) return;
      const preferences = this.reconcileDevices(devices);
      this.publish({ devices, preferences, error: this.state.error === DEVICE_ENUMERATION_LABEL ? null : this.state.error });
    } catch {
      if (generation === this.enumerationGeneration) this.publish({ error: DEVICE_ENUMERATION_LABEL });
    }
  }
  private reconcileDevices(devices: MediaDeviceEntry[]): MediaDevicePreferences {
    const preferences = { ...this.state.preferences };
    for (const kind of MEDIA_DEVICE_KINDS) {
      const canIdentify = [...devices, ...this.state.devices].some(device => device.kind === kind && device.deviceId);
      if (canIdentify && !devices.some(device => device.kind === kind && device.deviceId === preferences[kind])) preferences[kind] = DEFAULT_MEDIA_DEVICE_ID;
    }
    if (MEDIA_DEVICE_KINDS.some(kind => preferences[kind] !== this.state.preferences[kind])) persistMediaDevicePreferences(preferences, this.storage);
    return preferences;
  }
  select(kind: MediaDeviceKind, deviceId: string): void {
    if (this.disposed || (kind === "audiooutput" && !this.state.speakerSelectionSupported)) return;
    if (this.state.preferences[kind] === deviceId) return;
    this.stopPreview();
    const preferences = { ...this.state.preferences, [kind]: deviceId || DEFAULT_MEDIA_DEVICE_ID };
    persistMediaDevicePreferences(preferences, this.storage);
    this.publish({ preferences, error: null });
  }
  async startPreview(options: { audio: boolean; video: boolean }): Promise<void> {
    if (this.disposed) return;
    this.stopPreview();
    if (!options.audio && !options.video) return;
    const generation = this.previewGeneration;
    const { preferences } = this.state;
    this.publish({ busy: true, error: null });
    try {
      const stream = await this.adapter.getUserMedia({ audio: options.audio && deviceConstraint(preferences.audioinput), video: options.video && deviceConstraint(preferences.videoinput) });
      if (this.disposed || generation !== this.previewGeneration) { stopStream(stream); return; }
      this.watchPreview(stream);
      this.publish({ preview: stream, busy: false });
      await this.refresh();
    } catch (cause) {
      if (generation === this.previewGeneration) this.publish({ busy: false, error: captureError(cause) });
    }
  }
  private watchPreview(stream: MediaStream): void {
    const ended = () => { this.stopPreview(); this.publish({ error: DEVICE_UNPLUGGED_LABEL }); void this.refresh(); };
    stream.getTracks().forEach(track => track.addEventListener("ended", ended));
    this.detachPreview = () => stream.getTracks().forEach(track => track.removeEventListener("ended", ended));
  }
  stopPreview(): void {
    this.previewGeneration++;
    this.detachPreview?.();
    this.detachPreview = null;
    stopStream(this.state.preview);
    this.publish({ preview: null, busy: false });
  }
  dispose(): void {
    this.stopPreview();
    this.disposed = true;
    this.enumerationGeneration++;
    this.detachDeviceChange();
    this.listeners.clear();
  }
}

export function createBrowserMediaDeviceController(): MediaDeviceController {
  const devices = globalThis.navigator?.mediaDevices;
  const adapter: MediaDeviceAdapter = {
    enumerateDevices: () => devices ? devices.enumerateDevices() : Promise.reject(new Error(DEVICE_UNAVAILABLE_LABEL)),
    getUserMedia: constraints => devices ? devices.getUserMedia(constraints) : Promise.reject(new Error(DEVICE_UNAVAILABLE_LABEL)),
    speakerSelectionSupported: typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype,
    onDeviceChange: listener => {
      devices?.addEventListener("devicechange", listener);
      return () => devices?.removeEventListener("devicechange", listener);
    },
  };
  return new MediaDeviceController(adapter, browserDeviceStorage());
}
