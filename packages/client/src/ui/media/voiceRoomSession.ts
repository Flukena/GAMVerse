import { mediaControlError, type MediaControlSource } from "./mediaControlError";
import type { DisconnectReason, RoomConnectOptions, RoomEvent, LocalParticipant, LocalTrack, LocalTrackPublication, RemoteParticipant, RemoteTrack, RemoteTrackPublication, RoomEventCallbacks, TrackPublishOptions } from "livekit-client";
import { isVoiceAuthorizationDenied } from "./voiceToken";
import { voiceTargetKey, type VoiceTarget } from "./voiceTarget";

export const VOICE_RETRY_BASE_MS = 500;
export const VOICE_RETRY_MAX_DELAY_MS = 8_000;
export const VOICE_RETRY_MAX_ATTEMPTS = 5;
const VOICE_RETRY_MULTIPLIER = 2;
const VOICE_CONNECTION_ERROR_LABEL = "Could not connect to voice.";
const VOICE_CAMERA_SOURCE = "camera";
const VOICE_SCREEN_SHARE_SOURCE = "screen_share";
const VOICE_SCREEN_SHARE_AUDIO_SOURCE = "screen_share_audio";
const VOICE_MICROPHONE_SOURCE = "microphone";
const RETAINABLE_TRACK_SOURCES = [VOICE_CAMERA_SOURCE, VOICE_SCREEN_SHARE_SOURCE, VOICE_SCREEN_SHARE_AUDIO_SOURCE, VOICE_MICROPHONE_SOURCE];
export const VOICE_MEDIA_STOPPED_LABEL = "Camera and screen sharing stopped. Turn them on again when voice reconnects.";
export const VOICE_AUDIO_CAPTURE_OPTIONS = { autoGainControl: true, echoCancellation: true, noiseSuppression: true, voiceIsolation: true };

/** Small SDK seam: tests replace only the room and token transport. */
export interface VoiceRoom {
  connect(url: string, token: string, options?: RoomConnectOptions): Promise<void>;
  disconnect(stopTracks?: boolean): Promise<void>;
  localParticipant: Pick<LocalParticipant, "setMicrophoneEnabled" | "setCameraEnabled" | "setScreenShareEnabled"> & Partial<Pick<LocalParticipant, "isCameraEnabled" | "isScreenShareEnabled" | "audioTrackPublications" | "videoTrackPublications" | "publishTrack" | "unpublishTrack">>;
  on<E extends keyof RoomEventCallbacks>(event: E, listener: RoomEventCallbacks[E]): this;
  off<E extends keyof RoomEventCallbacks>(event: E, listener: RoomEventCallbacks[E]): this;
}
export interface VoiceSessionState {
  target: VoiceTarget | null;
  connected: boolean;
  muted: boolean;
  busy: boolean;
  retryExhausted: boolean;
  error: Error | null;
}
export interface VoiceSessionListener<R extends VoiceRoom> {
  stateChanged(state: VoiceSessionState): void;
  roomChanged?(room: R | null, target: VoiceTarget | null): void;
  speakersChanged?(room: R): void;
  participantsChanged?(room: R): void;
  localTracksChanged?(room: R, publication?: LocalTrackPublication): void;
  trackSubscribed?(room: R, track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant, target: VoiceTarget): void;
  trackUnsubscribed?(room: R, track: RemoteTrack, participant: RemoteParticipant): void;
  mediaStopped?(): void;
}
export interface VoiceRoomAdapter<R extends VoiceRoom> {
  room: R;
  events: typeof RoomEvent;
  disconnectError(reason?: DisconnectReason): Error;
  authorizationDenied(error: Error): boolean;
}
export interface VoiceSessionDependencies<R extends VoiceRoom> {
  initialMuted?: boolean;
  previousTeardown?: Promise<void>;
  createRoom(): Promise<VoiceRoomAdapter<R>>;
  fetchToken(target: VoiceTarget, signal: AbortSignal): Promise<{ url: string; token: string } | null>;
  schedule?(callback: () => void, delayMs: number): () => void;
}
type QueuedControl<R> = { generation: number; run: (room: R) => Promise<unknown>; finish: () => void; muted?: boolean; source?: MediaControlSource };
type RetainedTrack = { track: LocalTrack; options?: TrackPublishOptions };

function scheduleRetry(callback: () => void, delayMs: number): () => void {
  const timer = setTimeout(callback, delayMs);
  return () => clearTimeout(timer);
}

export class VoiceRoomSession<R extends VoiceRoom = VoiceRoom> {
  private target: VoiceTarget | null = null;
  private room: R | null = null;
  private pendingRoom: Promise<VoiceRoomAdapter<R>> | null = null;
  private authorizationDenied: ((error: Error) => boolean) | null = null;
  private generation = 0;
  private disposed = false;
  private suspended = false;
  private suspensionReasons = new Set<"browser" | "realtime">();
  private retries = 0;
  private abort: AbortController | null = null;
  private cancelRetry: (() => void) | null = null;
  private teardown: Promise<void> = Promise.resolve();
  private detachListeners: (() => void) | null = null;
  private controls: QueuedControl<R>[] = [];
  private drainingGeneration: number | null = null;
  private localVideoActive = false;
  private retainedTracks: RetainedTrack[] = [];
  private state: VoiceSessionState = { target: null, connected: false, muted: true, busy: false, retryExhausted: false, error: null };

  isProximityTarget(): boolean { return this.target?.kind === "proximity"; }

  constructor(private readonly dependencies: VoiceSessionDependencies<R>, private readonly listener: VoiceSessionListener<R>) {
    this.state.muted = dependencies.initialMuted ?? true;
    this.teardown = dependencies.previousTeardown ?? Promise.resolve();
  }

  setTarget(target: VoiceTarget | null): void {
    if (this.disposed || voiceTargetKey(this.target) === voiceTargetKey(target)) return;
    const preserveProximityMedia = this.target?.kind === "proximity" && target?.kind === "proximity"
      && this.target.officeId === target.officeId && this.target.sessionKey === target.sessionKey;
    this.invalidate(preserveProximityMedia);
    this.target = target;
    this.retries = 0;
    this.publish({ target, error: null, retryExhausted: false });
    this.start();
  }
  leave(): void { this.setTarget(null); }
  suppressMedia(): void {
    if (this.disposed) return;
    this.publish({ muted: true });
    this.leave();
  }
  dispose(): Promise<void> {
    if (this.disposed) return this.teardown;
    this.disposed = true;
    this.invalidate();
    this.target = null;
    this.publish({ target: null });
    return this.teardown;
  }
  suspend(reason: "browser" | "realtime" = "browser"): void {
    if (this.disposed) return;
    this.suspensionReasons.add(reason);
    if (this.suspended) return;
    this.suspended = true;
    this.invalidate();
  }
  resume(target: VoiceTarget | null, reason: "browser" | "realtime" = "browser"): void {
    if (this.disposed) return;
    if (!this.suspensionReasons.delete(reason)) return;
    if (this.suspensionReasons.size) return;
    this.suspended = false;
    this.revalidate(target);
  }
  private revalidate(target: VoiceTarget | null): void {
    this.invalidate();
    this.target = target;
    this.retries = 0;
    this.publish({ target, error: null, retryExhausted: false });
    this.start();
  }
  reconnect(): void {
    if (!this.target || this.disposed || this.suspended) return;
    this.revalidate(this.target);
  }

  private publish(update: Partial<VoiceSessionState>): void {
    this.state = { ...this.state, ...update };
    this.listener.stateChanged({ ...this.state });
  }
  private current(generation: number, room: R | null): boolean {
    return !this.disposed && !this.suspended && generation === this.generation && room === this.room;
  }
  private invalidate(preserveProximityMedia = false): void {
    this.generation++;
    this.abort?.abort();
    this.abort = null;
    this.cancelRetry?.();
    this.cancelRetry = null;
    this.detachListeners?.();
    this.detachListeners = null;
    const pendingRoom = this.pendingRoom;
    this.pendingRoom = null;
    if (pendingRoom) this.settleTeardown(pendingRoom.then(adapter => adapter.room.disconnect()));
    const room = this.room;
    this.room = null;
    this.controls.splice(0).forEach(control => control.finish());
    this.listener.roomChanged?.(null, null);
    this.publish({ connected: false, busy: false });
    if (room && preserveProximityMedia && room.localParticipant.audioTrackPublications && room.localParticipant.videoTrackPublications
      && room.localParticipant.publishTrack && room.localParticipant.unpublishTrack) {
      this.retainedTracks = this.retainedTracks.filter(({ track }) => track.mediaStreamTrack.readyState === "live");
      const publications = [...room.localParticipant.audioTrackPublications.values(), ...room.localParticipant.videoTrackPublications.values()];
      const retained = new Map(this.retainedTracks.map(item => [item.track, item]));
      for (const publication of publications) if (publication.track && !publication.isMuted
        && RETAINABLE_TRACK_SOURCES.includes(String(publication.source))) {
        retained.set(publication.track, { track: publication.track, ...(publication.options ? { options: publication.options } : {}) });
      }
      this.retainedTracks = [...retained.values()];
      const tracks = this.retainedTracks.map(({ track }) => track);
      this.settleTeardown(Promise.all(tracks.map(track => room.localParticipant.unpublishTrack!(track, false)))
        .then(() => room.disconnect(false)));
      this.localVideoActive = this.retainedTracks.some(({ track }) => track.kind === "video");
    } else {
      if (room) {
        if (this.localVideoActive || room.localParticipant.isCameraEnabled || room.localParticipant.isScreenShareEnabled) this.listener.mediaStopped?.();
        this.localVideoActive = false;
        this.disconnect(room);
      }
      if (!preserveProximityMedia) this.stopRetainedTracks();
    }
  }
  private disconnect(room: R): void {
    // Start immediately to cancel pending connect, but join waits for teardown.
    this.settleTeardown(room.disconnect());
  }
  private settleTeardown(disconnect: Promise<void>): void {
    const generation = this.generation;
    this.teardown = Promise.allSettled([this.teardown, disconnect]).then(results => {
      const failure = results.find(result => result.status === "rejected");
      if (failure?.status !== "rejected" || !this.current(generation, null)) return;
      const error = failure.reason instanceof Error ? failure.reason : new Error(VOICE_CONNECTION_ERROR_LABEL);
      if (this.target) console.warn(error);
      else this.publish({ error, busy: false });
    });
  }
  private start(): void {
    if (!this.target || this.suspended || this.disposed) return;
    const generation = this.generation;
    const target = this.target;
    this.publish({ busy: true });
    void this.join(generation, target);
  }
  private async join(generation: number, target: VoiceTarget): Promise<void> {
    let room: R | null = null;
    try {
      await this.teardown;
      if (!this.current(generation, null)) return;
      const abort = new AbortController();
      this.abort = abort;
      const token = await this.dependencies.fetchToken(target, abort.signal);
      if (!this.current(generation, null)) return;
      if (!token) {
        if (this.retainedTracks.length) this.listener.mediaStopped?.();
        this.stopRetainedTracks();
        this.localVideoActive = false;
        this.publish({ muted: true, busy: false });
        return;
      }
      const pendingRoom = this.dependencies.createRoom();
      this.pendingRoom = pendingRoom;
      const adapter = await pendingRoom;
      if (!this.current(generation, null)) return;
      this.pendingRoom = null;
      room = adapter.room;
      this.room = room;
      this.authorizationDenied = adapter.authorizationDenied;
      this.bindRoom(adapter, generation, target);
      this.listener.roomChanged?.(room, target);
      await room.connect(token.url, token.token, { autoSubscribe: false });
      if (!this.current(generation, room)) return;
      if (this.retainedTracks.length) await this.restoreRetainedTracks(room, generation);
      else await this.resetMedia(room, generation);
      if (!this.current(generation, room)) return;
      this.listener.localTracksChanged?.(room);
      this.retries = 0;
      this.listener.speakersChanged?.(room);
      this.listener.participantsChanged?.(room);
      this.publish({ connected: true, busy: false, error: null });
      void this.drainControls();
    } catch (cause) {
      if (!this.current(generation, room)) return;
      this.pendingRoom = null;
      // Cancelled/CLIENT_INITIATED on the current generation is a real failure.
      const error = cause instanceof Error ? cause : new Error(VOICE_CONNECTION_ERROR_LABEL);
      this.fail(error);
    }
  }
  private async restoreRetainedTracks(room: R, generation: number): Promise<void> {
    const tracks = this.retainedTracks.filter(({ track }) => track.mediaStreamTrack.readyState === "live");
    this.retainedTracks = [];
    try {
      for (const { track, options } of tracks) {
        if (!this.current(generation, room)) { track.stop(); continue; }
        await room.localParticipant.publishTrack!(track, options);
      }
    } catch (cause) {
      tracks.forEach(({ track }) => track.stop());
      this.localVideoActive = false;
      this.publish({ muted: true });
      this.listener.mediaStopped?.();
      throw cause;
    }
  }
  private stopRetainedTracks(): void {
    this.retainedTracks.forEach(({ track }) => track.stop());
    this.retainedTracks = [];
  }
  private async resetMedia(room: R, generation: number): Promise<void> {
    // Joining voice is receive-only by default. A missing or denied microphone
    // permission must not prevent the participant from hearing the room.
    const muted = this.state.muted;
    this.publish({ muted, error: null });
    await room.localParticipant.setMicrophoneEnabled(!muted, muted ? undefined : VOICE_AUDIO_CAPTURE_OPTIONS);
    if (!this.current(generation, room)) return;
    await room.localParticipant.setCameraEnabled(false);
    if (!this.current(generation, room)) return;
    await room.localParticipant.setScreenShareEnabled(false);
  }
  private fail(error: Error): void {
    this.invalidate(this.target?.kind === "proximity");
    if (isVoiceAuthorizationDenied(error) || this.authorizationDenied?.(error)) {
      this.publish({ error, busy: false }); return;
    }
    if (this.retries >= VOICE_RETRY_MAX_ATTEMPTS) {
      this.publish({ error, busy: false, retryExhausted: true }); return;
    }
    this.publish({ error: null, busy: true });
    const delayMs = Math.min(VOICE_RETRY_BASE_MS * VOICE_RETRY_MULTIPLIER ** this.retries, VOICE_RETRY_MAX_DELAY_MS);
    this.retries++;
    const generation = this.generation;
    this.cancelRetry = (this.dependencies.schedule ?? scheduleRetry)(() => {
      if (!this.current(generation, null)) return;
      this.cancelRetry = null;
      this.start();
    }, delayMs);
  }
  private bindRoom(adapter: VoiceRoomAdapter<R>, generation: number, target: VoiceTarget): void {
    const { room, events } = adapter;
    const removers: Array<() => void> = [];
    const bind = <E extends keyof RoomEventCallbacks>(event: E, callback: RoomEventCallbacks[E]) => {
      room.on(event, callback);
      removers.push(() => { room.off(event, callback); });
    };
    bind(events.Disconnected, reason => {
      if (!this.current(generation, room)) return;
      this.fail(adapter.disconnectError(reason));
    });
    bind(events.Reconnecting, () => { if (this.current(generation, room)) this.publish({ connected: false, busy: true }); });
    bind(events.Reconnected, () => {
      if (!this.current(generation, room)) return;
      this.publish({ connected: true, busy: false });
      this.listener.participantsChanged?.(room);
      void this.drainControls();
    });
    this.bindMediaEvents(bind, room, events, generation, target);
    this.detachListeners = () => removers.forEach(remove => remove());
  }
  private bindMediaEvents(bind: <E extends keyof RoomEventCallbacks>(event: E, callback: RoomEventCallbacks[E]) => void, room: R, events: typeof RoomEvent, generation: number, target: VoiceTarget): void {
    bind(events.ActiveSpeakersChanged, () => { if (this.current(generation, room)) this.listener.speakersChanged?.(room); });
    bind(events.LocalTrackPublished, publication => {
      if (!this.current(generation, room)) return;
      if (String(publication.source) === VOICE_CAMERA_SOURCE || String(publication.source) === VOICE_SCREEN_SHARE_SOURCE) this.localVideoActive = true;
      this.listener.localTracksChanged?.(room, publication);
    });
    bind(events.LocalTrackUnpublished, publication => {
      if (!this.current(generation, room)) return;
      const track = publication.track;
      if (target.kind === "proximity" && track && !publication.isMuted
        && RETAINABLE_TRACK_SOURCES.includes(String(publication.source))
        && track.mediaStreamTrack.readyState === "live") {
        this.retainedTracks = [...this.retainedTracks.filter(item => item.track !== track), {
          track, ...(publication.options ? { options: publication.options } : {}),
        }];
      }
      this.listener.localTracksChanged?.(room);
    });
    bind(events.TrackSubscribed, (track, publication, participant) => {
      if (this.current(generation, room)) {
        this.listener.trackSubscribed?.(room, track, publication, participant, target);
        this.listener.participantsChanged?.(room);
      }
    });
    bind(events.TrackUnsubscribed, (track, _publication, participant) => {
      if (this.current(generation, room)) {
        this.listener.trackUnsubscribed?.(room, track, participant);
        this.listener.participantsChanged?.(room);
      }
    });
    bind(events.TrackPublished, (publication) => {
      if (!this.current(generation, room)) return;
      if (publication.kind === "audio") publication.setSubscribed(true);
      this.listener.participantsChanged?.(room);
    });
    for (const event of [events.ParticipantConnected, events.ParticipantDisconnected, events.TrackUnpublished]) {
      bind(event, () => { if (this.current(generation, room)) this.listener.participantsChanged?.(room); });
    }
    for (const event of [events.TrackMuted, events.TrackUnmuted]) {
      bind(event, () => {
        if (!this.current(generation, room)) return;
        this.listener.participantsChanged?.(room);
        this.listener.localTracksChanged?.(room);
      });
    }
  }
  control(run: (room: R) => Promise<unknown>, source?: MediaControlSource): Promise<void> {
    return this.enqueueControl(run, undefined, source);
  }
  private enqueueControl(run: (room: R) => Promise<unknown>, muted?: boolean, source?: MediaControlSource): Promise<void> {
    if (!this.target || this.suspended || this.disposed) return Promise.resolve();
    return new Promise(resolve => {
      this.controls.push({ generation: this.generation, run, finish: resolve, muted, source });
      void this.drainControls();
    });
  }
  setMuted(muted: boolean): Promise<void> {
    return this.enqueueControl(room => room.localParticipant.setMicrophoneEnabled(!muted, VOICE_AUDIO_CAPTURE_OPTIONS), muted);
  }
  private async drainControls(): Promise<void> {
    const generation = this.generation;
    if (this.drainingGeneration === generation) return;
    this.drainingGeneration = generation;
    try { await this.runControls(generation); }
    finally {
      // A browser permission prompt in an old room may remain pending after
      // disconnect. It must neither block nor unlock the new room's controls.
      if (this.drainingGeneration === generation) {
        this.drainingGeneration = null;
        if (this.controls.length && this.state.connected) void this.drainControls();
      }
    }
  }
  private async runControls(generation: number): Promise<void> {
    while (generation === this.generation && this.state.connected && this.room && this.controls.length) {
      await this.executeControl(this.controls.shift()!, this.room);
    }
  }
  private async executeControl(control: QueuedControl<R>, room: R): Promise<void> {
    try {
      await control.run(room);
      if (!this.current(control.generation, room)) return;
      this.publish({ error: null, ...(control.muted !== undefined ? { muted: control.muted } : {}) });
      this.localVideoActive = Boolean(room.localParticipant.isCameraEnabled || room.localParticipant.isScreenShareEnabled);
      this.listener.localTracksChanged?.(room);
    } catch (cause) {
      if (this.current(control.generation, room)) this.publish({ ...(control.muted === false ? { muted: true } : {}), error: mediaControlError(cause, control.source) });
    } finally { control.finish(); }
  }
}
