import { useEffect, useState } from "react";
import { MICROPHONE_METER_MAX_PERCENT } from "./DeviceSettingsMeter";
import { openMicrophoneMeter } from "./DeviceSettingsAudioMeter";

const MICROPHONE_METER_INTERVAL_MS = 100;
const MICROPHONE_METER_UNAVAILABLE_LABEL = "Microphone level unavailable. You can still continue muted.";

export function DeviceSettingsMicrophoneMeter({ stream }: Readonly<{ stream: MediaStream }>) {
  const [level, setLevel] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    if (typeof AudioContext === "undefined") { setUnavailable(true); return; }
    const meter = openMicrophoneMeter(stream, () => setUnavailable(true));
    if (!meter) return;
    const interval = window.setInterval(() => {
      setLevel(meter.readLevelPercent());
    }, MICROPHONE_METER_INTERVAL_MS);
    return () => {
      window.clearInterval(interval);
      meter.dispose();
    };
  }, [stream]);
  return <div className="device-settings-meter">
    <label>Microphone level <meter min={0} max={MICROPHONE_METER_MAX_PERCENT} value={level} /></label>
    <p role="status">{unavailable ? MICROPHONE_METER_UNAVAILABLE_LABEL : "Speak to check your microphone. Test audio stays on this device."}</p>
  </div>;
}
