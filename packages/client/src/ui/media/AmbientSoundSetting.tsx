import { useState } from "react";
import { readAmbientSoundsEnabled, setAmbientSoundsEnabled } from "../../audio/ambientSoundPreference";

export function AmbientSoundSetting() {
  const [enabled, setEnabled] = useState(readAmbientSoundsEnabled);
  return <div className="permission-row settings-general-row">
    <div><strong>Ambient sounds</strong><small>Footsteps and the vehicle engine near your character</small></div>
    <label className="settings-toggle-control"><span className="sr-only">Ambient sounds</span>
      <input type="checkbox" role="switch" checked={enabled} onChange={(event) => {
        const nextEnabled = event.target.checked;
        setEnabled(nextEnabled);
        setAmbientSoundsEnabled(nextEnabled);
      }} /><span aria-hidden="true" />
    </label>
  </div>;
}
