import { useEffect, useRef, useState } from "react";
import type { LocalVideoTrack } from "livekit-client";
import { applyCameraBackgroundMode, type CameraBackgroundMode } from "./cameraBackground";
import { DeviceSettingsPreview } from "./DeviceSettingsPreview";
import "./DeviceSettings.css";

type CameraDevice = Pick<MediaDeviceInfo, "deviceId" | "label">;

interface CameraSettingsProps {
  deviceId: string;
  backgroundMode: CameraBackgroundMode;
  onDeviceChange(deviceId: string): Promise<void>;
  onBackgroundModeChange(mode: CameraBackgroundMode): Promise<void>;
}

export function CameraSettings({ deviceId, backgroundMode, onDeviceChange, onBackgroundModeChange }: Readonly<CameraSettingsProps>) {
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [preview, setPreview] = useState<MediaStream | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const previewTrackRef = useRef<LocalVideoTrack | null>(null);
  const previewGenerationRef = useRef(0);

  const stopPreview = () => {
    previewGenerationRef.current++;
    previewTrackRef.current?.stop();
    previewTrackRef.current = null;
    setPreview(null);
    setBusy(false);
  };

  const refreshDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setError("Camera selection is not supported by this browser.");
      return;
    }
    try {
      const available = await navigator.mediaDevices.enumerateDevices();
      setDevices(available.filter((device) => device.kind === "videoinput" && device.deviceId));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not list cameras.");
    }
  };

  const startPreview = async () => {
    stopPreview();
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera preview is not supported by this browser.");
      return;
    }
    const generation = previewGenerationRef.current;
    setBusy(true);
    let track: LocalVideoTrack | null = null;
    try {
      const { createLocalVideoTrack } = await import("livekit-client");
      const deviceConstraint = deviceId && deviceId !== "default" ? { exact: deviceId } : undefined;
      track = await createLocalVideoTrack({ deviceId: deviceConstraint });
      if (generation !== previewGenerationRef.current) {
        track.stop();
        return;
      }
      previewTrackRef.current = track;
      if (backgroundMode !== "off") await applyCameraBackgroundMode(track, backgroundMode);
      if (generation !== previewGenerationRef.current) {
        track.stop();
        if (previewTrackRef.current === track) previewTrackRef.current = null;
        return;
      }
      setPreview(new MediaStream([track.mediaStreamTrack]));
      await refreshDevices();
    } catch (cause) {
      track?.stop();
      if (previewTrackRef.current === track) previewTrackRef.current = null;
      if (generation === previewGenerationRef.current) {
        setError(cause instanceof Error && cause.name === "NotAllowedError"
          ? "Camera access was denied. Allow it in browser permissions, then try again."
          : cause instanceof Error ? cause.message : "Could not start camera preview.");
      }
    } finally {
      if (generation === previewGenerationRef.current) setBusy(false);
    }
  };

  const changeCamera = async (nextDeviceId: string) => {
    stopPreview();
    setError("");
    try { await onDeviceChange(nextDeviceId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not switch camera."); }
  };

  const changeBackground = async (mode: CameraBackgroundMode) => {
    setError("");
    try {
      if (previewTrackRef.current) await applyCameraBackgroundMode(previewTrackRef.current, mode);
      await onBackgroundModeChange(mode);
    } catch (cause) {
      if (previewTrackRef.current) await applyCameraBackgroundMode(previewTrackRef.current, backgroundMode).catch(() => undefined);
      setError(cause instanceof Error ? cause.message : "Could not apply the camera background effect.");
    }
  };

  useEffect(() => {
    void refreshDevices();
    const onDeviceChangeEvent = () => void refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", onDeviceChangeEvent);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", onDeviceChangeEvent);
      previewGenerationRef.current++;
      previewTrackRef.current?.stop();
      previewTrackRef.current = null;
    };
  }, []);

  return <section aria-labelledby="camera-settings-title">
    <span className="eyebrow">VIDEO DEVICES</span>
    <h3 id="camera-settings-title">Camera</h3>
    <p className="settings-intro">Choose a camera and preview it privately. Camera and microphone stay off until you turn them on in the office.</p>
    <label className="sound-device-field"><span>Camera device</span>
      <select value={deviceId || "default"} disabled={busy} onChange={(event) => void changeCamera(event.target.value)}>
        <option value="default">System default camera</option>
        {devices.filter((device) => device.deviceId !== "default").map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}
        {deviceId && deviceId !== "default" && !devices.some((device) => device.deviceId === deviceId) && <option value={deviceId}>Previously selected camera (unavailable)</option>}
      </select>
    </label>
    <label className="sound-device-field"><span>Background</span>
      <select value={backgroundMode} disabled={busy} onChange={(event) => void changeBackground(event.target.value as CameraBackgroundMode)}>
        <option value="off">No effect</option>
        <option value="blur">Blur background</option>
        <option value="image">Soft office background</option>
      </select>
    </label>
    <div className="sound-device-actions">
      {preview
        ? <button type="button" className="lobby-button" onClick={stopPreview}>Stop camera preview</button>
        : <button type="button" className="lobby-button" disabled={busy} onClick={() => void startPreview()}>{busy ? "Starting camera…" : "Preview camera"}</button>}
      <button type="button" className="lobby-button" disabled={busy} onClick={() => void refreshDevices()}>Refresh cameras</button>
    </div>
    {error && <p className="sound-device-error" role="alert">{error}</p>}
    <div className="camera-settings-preview"><DeviceSettingsPreview stream={preview} /></div>
  </section>;
}
