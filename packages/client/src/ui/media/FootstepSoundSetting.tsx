import { useState } from "react";
import { readFootstepsEnabled, setFootstepsEnabled } from "../../audio/footstepPreference";

export function FootstepSoundSetting() {
  const [enabled, setEnabled] = useState(readFootstepsEnabled);
  return <div className="permission-row settings-general-row">
    <div><strong>Walking sounds</strong><small>Soft footsteps for your character in 2D and 3D</small></div>
    <label className="settings-toggle-control"><span className="sr-only">Walking sounds</span>
      <input type="checkbox" role="switch" checked={enabled} onChange={(event) => {
        const nextEnabled = event.target.checked;
        setEnabled(nextEnabled);
        setFootstepsEnabled(nextEnabled);
      }} /><span aria-hidden="true" />
    </label>
  </div>;
}
