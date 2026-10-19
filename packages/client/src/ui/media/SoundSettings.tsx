import { useEffect, useRef, useState } from "react";
import { AmbientSoundSetting } from "./AmbientSoundSetting";
import { DeviceSettingsMicrophoneMeter } from "./DeviceSettingsMicrophoneMeter";

type AudioDevices = { inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] };

export function SoundSettings({
  inputDeviceId,
  outputDeviceId,
  onInputDeviceChange,
  onOutputDeviceChange,
  noiseReductionEnabled,
  noiseReductionStatus,
  noiseReductionDetails,
  onNoiseReductionChange,
}: {
  inputDeviceId: string;
  outputDeviceId: string;
  onInputDeviceChange: (deviceId: string) => Promise<void>;
  onOutputDeviceChange: (deviceId: string) => Promise<void>;
  noiseReductionEnabled: boolean;
  noiseReductionStatus: "unknown" | "checking" | "enabled" | "fallback" | "disabled";
  noiseReductionDetails: string;
  onNoiseReductionChange: (enabled: boolean) => void;
}) {
  const [devices, setDevices] = useState<AudioDevices>({ inputs: [], outputs: [] });
  const [deviceMessage, setDeviceMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [switchError, setSwitchError] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [testStream, setTestStream] = useState<MediaStream | null>(null);
  const testStreamRef = useRef<MediaStream | null>(null);
  const testGenerationRef = useRef(0);

  const stopMicrophoneTest = () => {
    testGenerationRef.current++;
    testStreamRef.current?.getTracks().forEach((track) => track.stop());
    testStreamRef.current = null;
    setTestStream(null);
    setTestBusy(false);
  };

  const startMicrophoneTest = async () => {
    stopMicrophoneTest();
    setSwitchError("");
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.getUserMedia) {
      setSwitchError("Microphone testing is not supported by this browser.");
      return;
    }
    const generation = testGenerationRef.current;
    setTestBusy(true);
    try {
      const stream = await mediaDevices.getUserMedia({
        audio: inputDeviceId ? { deviceId: { exact: inputDeviceId } } : true,
      });
      if (generation !== testGenerationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      testStreamRef.current = stream;
      setTestStream(stream);
      await refreshDevices();
    } catch (cause) {
      setSwitchError(cause instanceof Error && cause.name === "NotAllowedError"
        ? "Microphone access was denied. Allow it in browser permissions, then try again."
        : cause instanceof Error ? cause.message : "Could not start the microphone test.");
    } finally {
      if (generation === testGenerationRef.current) setTestBusy(false);
    }
  };

  const refreshDevices = async (requestAccess = false) => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.enumerateDevices) {
      setDeviceMessage("Audio device selection is not supported by this browser.");
      return;
    }
    setBusy(true);
    setDeviceMessage("");
    try {
      if (requestAccess) {
        const stream = await mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      }
      const available = await mediaDevices.enumerateDevices();
      setDevices({
        inputs: available.filter((device) => device.kind === "audioinput"),
        outputs: available.filter((device) => device.kind === "audiooutput"),
      });
      if (available.every((device) => !device.label)) setDeviceMessage("Allow microphone access to show device names.");
    } catch (cause) {
      setDeviceMessage(cause instanceof Error && cause.name === "NotAllowedError" ? "Microphone access was denied. Change it in browser permissions to see device names." : "Could not load audio devices.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refreshDevices();
    const onDeviceChange = () => void refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", onDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", onDeviceChange);
      testGenerationRef.current++;
      testStreamRef.current?.getTracks().forEach((track) => track.stop());
      testStreamRef.current = null;
    };
  }, []);

  const chooseInput = async (deviceId: string) => {
    setSwitchError("");
    try { await onInputDeviceChange(deviceId); }
    catch (cause) { setSwitchError(cause instanceof Error ? cause.message : "Could not switch microphone."); }
  };
  const chooseOutput = async (deviceId: string) => {
    setSwitchError("");
    try { await onOutputDeviceChange(deviceId); }
    catch (cause) { setSwitchError(cause instanceof Error ? cause.message : "Could not switch speaker."); }
  };
  const selectAudioOutput = (navigator.mediaDevices as MediaDevices & { selectAudioOutput?: () => Promise<MediaDeviceInfo> } | undefined)?.selectAudioOutput;

  return <section aria-labelledby="sound-settings-title">
    <span className="eyebrow">VOICE DEVICES</span><h3 id="sound-settings-title">Sound</h3>
    <p className="settings-intro">Choose which microphone and speaker GAMVerse uses on this device.</p>
    <label className="sound-device-field"><span>Input device</span><select value={inputDeviceId} onChange={(event) => void chooseInput(event.target.value)}>
      <option value="">System default microphone</option>
      {devices.inputs.filter((device) => device.deviceId && device.deviceId !== "default").map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}
      {inputDeviceId && !devices.inputs.some((device) => device.deviceId === inputDeviceId) && <option value={inputDeviceId}>Previously selected microphone (unavailable)</option>}
    </select></label>
    <label className="sound-device-field"><span>Output device</span><select value={outputDeviceId} onChange={(event) => void chooseOutput(event.target.value)}>
      <option value="">System default speaker</option>
      {devices.outputs.filter((device) => device.deviceId && device.deviceId !== "default").map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Speaker ${index + 1}`}</option>)}
      {outputDeviceId && !devices.outputs.some((device) => device.deviceId === outputDeviceId) && <option value={outputDeviceId}>Previously selected speaker (unavailable)</option>}
    </select></label>
    <div className="sound-device-actions"><button type="button" className="lobby-button" disabled={busy} onClick={() => void refreshDevices(true)}>{busy ? "Loading devices…" : "Allow access & refresh"}</button>
      {selectAudioOutput && <button type="button" className="lobby-button" disabled={busy} onClick={async () => {
        try { const device = await selectAudioOutput.call(navigator.mediaDevices); setDevices((current) => ({ ...current, outputs: [...current.outputs.filter((item) => item.deviceId !== device.deviceId), device] })); await chooseOutput(device.deviceId); }
        catch (cause) { if (!(cause instanceof DOMException && cause.name === "NotAllowedError")) setSwitchError(cause instanceof Error ? cause.message : "Could not choose speaker."); }
      }}>Choose speaker…</button>}
    </div>
    <div className="sound-device-test">
      <div><strong>Microphone test</strong><small>Test locally. Audio is not shared with the office.</small></div>
      {testStream
        ? <button type="button" className="lobby-button" onClick={stopMicrophoneTest}>Stop test</button>
        : <button type="button" className="lobby-button" disabled={testBusy} onClick={() => void startMicrophoneTest()}>{testBusy ? "Starting test…" : "Test microphone"}</button>}
      {testStream && <DeviceSettingsMicrophoneMeter stream={testStream} />}
    </div>
    {deviceMessage && <p className="sound-device-note" role="status">{deviceMessage}</p>}
    {switchError && <p className="sound-device-error" role="alert">{switchError}</p>}
    <AmbientSoundSetting />
    <div className="permission-row settings-general-row sound-noise-row"><div><strong>Noise reduction</strong><small>Reduce background noise locally with RNNoise</small><small className={`noise-reduction-status ${noiseReductionStatus}`} role="status">{noiseReductionStatus === "checking" ? "Loading local noise filter…" : noiseReductionStatus === "enabled" ? "RNNoise noise reduction is active" : noiseReductionStatus === "fallback" ? `RNNoise unavailable: ${noiseReductionDetails || "browser noise reduction remains active"}` : noiseReductionStatus === "disabled" ? "Using browser noise reduction" : "Applies when you join voice"}</small></div><label className="settings-toggle-control"><span className="sr-only">Noise reduction</span><input type="checkbox" role="switch" checked={noiseReductionEnabled} onChange={(event) => onNoiseReductionChange(event.target.checked)} /><span aria-hidden="true" /></label></div>
  </section>;
}
