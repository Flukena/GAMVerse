import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { WorkspaceDialog } from "../workspace/WorkspaceDialog";
import { createBrowserMediaDeviceController, type MediaDeviceController, type MediaDeviceEntry, type MediaDevicePreferences, type MediaDeviceSnapshot } from "./mediaDevices";
import { DEFAULT_MEDIA_DEVICE_ID } from "./mediaDevicePreferences";
import { DeviceSettingsPreview } from "./DeviceSettingsPreview";
import "./DeviceSettings.css";

export interface DeviceSettingsDialogProps {
  mode: "prejoin" | "settings";
  onClose(): void;
  onJoin?(): void;
  onApply?(preferences: MediaDevicePreferences, speakerSelectionSupported: boolean): Promise<void>;
  createController?(): MediaDeviceController;
}

interface DeviceSelectorProps {
  kind: MediaDeviceKind;
  label: string;
  devices: readonly MediaDeviceEntry[];
  selectedId: string;
  disabled: boolean;
  controller: MediaDeviceController;
}

function DeviceSelector({ kind, label, devices, selectedId, disabled, controller }: Readonly<DeviceSelectorProps>) {
  const options = devices.filter(device => device.kind === kind && device.deviceId !== "" && device.deviceId !== DEFAULT_MEDIA_DEVICE_ID);
  return <label className="device-settings-select">{label}
    <select value={selectedId} disabled={disabled} onChange={event => controller.select(kind, event.target.value)}>
      <option value={DEFAULT_MEDIA_DEVICE_ID}>System default</option>
      {options.map((device, index) => <option key={device.deviceId} value={device.deviceId}>
        {device.label || `${label} ${index + 1}`}
      </option>)}
    </select>
  </label>;
}

function DeviceSettingsStatus({ snapshot, applying, applyError }: Readonly<{ snapshot: MediaDeviceSnapshot; applying: boolean; applyError: string | null }>) {
  return <>
    {!snapshot.speakerSelectionSupported && <p>Speaker selection is unavailable in this browser. Use your system sound settings.</p>}
    {snapshot.devices.length === 0 && <p>No devices listed yet. Connect a device or allow a test, then refresh devices. You can continue without testing.</p>}
    {snapshot.busy && <p role="status">Waiting for device access… You can continue muted at any time.</p>}
    {snapshot.error && <div role="alert"><p>{snapshot.error}</p><p>Allow access in your browser settings, then retry a test.</p></div>}
    {applyError && <p role="alert">{applyError}</p>}
    {applying && <p role="status">Applying selected devices…</p>}
  </>;
}

export function DeviceSettingsDialog({ createController = createBrowserMediaDeviceController, ...props }: Readonly<DeviceSettingsDialogProps>) {
  const [controller, setController] = useState<MediaDeviceController | null>(null);
  useEffect(() => {
    const next = createController();
    setController(next);
    void next.refresh();
    return () => next.dispose();
  }, [createController]);
  return controller ? <DeviceSettingsContent {...props} controller={controller} /> : null;
}

function DeviceSettingsContent({ mode, onClose, onJoin, onApply, controller }: Readonly<DeviceSettingsDialogProps & { controller: MediaDeviceController }>) {
  const titleId = useId();
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const activeRef = useRef(true);
  useEffect(() => {
    activeRef.current = true;
    return () => { activeRef.current = false; };
  }, [controller]);
  const snapshot = useSyncExternalStore(listener => controller.subscribe(listener), () => controller.snapshot);
  const close = () => { activeRef.current = false; controller.stopPreview(); onClose(); };
  const finish = async () => {
    if (applying) return;
    controller.stopPreview();
    setApplying(true);
    setApplyError(null);
    try {
      await onApply?.(snapshot.preferences, snapshot.speakerSelectionSupported);
      if (!activeRef.current) return;
      if (mode === "prejoin") onJoin?.();
      else onClose();
    } catch (error) {
      if (activeRef.current) setApplyError(error instanceof Error ? error.message : "Could not apply devices. Choose another device and retry.");
    } finally { if (activeRef.current) setApplying(false); }
  };
  const common = { controller, devices: snapshot.devices, disabled: snapshot.busy || applying };
  return <WorkspaceDialog labelledBy={titleId} onClose={close} className="device-settings-dialog">
    <header><h2 id={titleId}>{mode === "prejoin" ? "Check your devices" : "Audio and video settings"}</h2>
      <button type="button" aria-label="Close device settings" onClick={close}>×</button></header>
    <p>{mode === "prejoin" ? "Your tests stay private. Joining keeps your microphone and camera off until you turn them on in the office." : "Your tests stay private. Selecting a device keeps your current microphone and camera on/off settings."}</p>
    <DeviceSelector {...common} kind="audioinput" label="Microphone" selectedId={snapshot.preferences.audioinput} />
    <DeviceSelector {...common} kind="videoinput" label="Camera" selectedId={snapshot.preferences.videoinput} />
    <DeviceSelector {...common} kind="audiooutput" label="Speaker" selectedId={snapshot.preferences.audiooutput}
      disabled={snapshot.busy || applying || !snapshot.speakerSelectionSupported} />
    <div className="device-settings-actions">
      <button type="button" disabled={snapshot.busy || applying} onClick={() => { void controller.startPreview({ audio: true, video: false }); }}>Test microphone</button>
      <button type="button" disabled={snapshot.busy || applying} onClick={() => { void controller.startPreview({ audio: false, video: true }); }}>Preview camera</button>
      <button type="button" disabled={!snapshot.preview && !snapshot.busy} onClick={() => controller.stopPreview()}>Stop test</button>
    </div>
    <DeviceSettingsPreview stream={snapshot.preview} />
    <DeviceSettingsStatus snapshot={snapshot} applying={applying} applyError={applyError} />
    <button type="button" disabled={snapshot.busy} onClick={() => { void controller.refresh(); }}>Refresh devices</button>
    <footer>{mode === "prejoin" ? <>
      <button type="button" disabled={applying} onClick={() => { void finish(); }}>Skip device check</button>
      <button type="button" disabled={applying} className="device-settings-primary" onClick={() => { void finish(); }}>Join office muted</button>
    </> : <button type="button" disabled={applying} className="device-settings-primary" onClick={() => { void finish(); }}>Done</button>}</footer>
  </WorkspaceDialog>;
}
