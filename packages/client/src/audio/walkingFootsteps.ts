import { FootstepCadence } from "./footstepCadence";
import { FOOTSTEP_PREFERENCE_EVENT, readFootstepsEnabled } from "./footstepPreference";
import { SoftFootstepSound, type FootstepSound } from "./softFootstepSound";

type WalkingPlayer = { x: number; z: number; sittingPropId?: string; vehicleId?: string };

export class WalkingFootsteps {
  private readonly cadence = new FootstepCadence();
  private sessionId: string | null = null;
  private enabled = true;
  private disposed = false;

  constructor(private readonly sound: FootstepSound) {}

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.silence();
  }

  silence() {
    this.cadence.reset();
    this.sound.stop();
  }

  update(player: WalkingPlayer | undefined, sessionId: string | null, nowMs: number, blocked: boolean) {
    if (this.disposed) return;
    if (this.sessionId !== sessionId) {
      this.sessionId = sessionId;
      this.silence();
    }
    if (!this.enabled || blocked || !player || !sessionId || player.sittingPropId || player.vehicleId) {
      this.silence();
      return;
    }
    if (this.cadence.advance(player.x, player.z, nowMs)) this.sound.play();
  }

  dispose() {
    this.disposed = true;
    this.cadence.reset();
    this.sound.dispose();
  }
}

export function createWalkingFootsteps() {
  const sound = new SoftFootstepSound();
  const footsteps = new WalkingFootsteps(sound);
  footsteps.setEnabled(readFootstepsEnabled());
  const unlock = (event: Event) => { if (event.isTrusted) sound.unlock(); };
  const onVisibility = () => { if (document.hidden) footsteps.silence(); };
  const onPreference = (event: Event) => footsteps.setEnabled((event as CustomEvent<boolean>).detail);
  const onStorage = () => footsteps.setEnabled(readFootstepsEnabled());
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
  window.addEventListener(FOOTSTEP_PREFERENCE_EVENT, onPreference);
  window.addEventListener("storage", onStorage);
  document.addEventListener("visibilitychange", onVisibility);
  return {
    update(player: WalkingPlayer | undefined, sessionId: string | null, nowMs: number, blocked: boolean) {
      footsteps.update(player, sessionId, nowMs, blocked || document.hidden);
    },
    dispose() {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
      window.removeEventListener(FOOTSTEP_PREFERENCE_EVENT, onPreference);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
      footsteps.dispose();
    },
  };
}
