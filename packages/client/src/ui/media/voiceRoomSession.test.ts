import assert from "node:assert/strict";
import test from "node:test";
import { ConnectionError, DisconnectReason, RoomEvent, type RoomEventCallbacks } from "livekit-client";
import { VoiceRoomSession, VOICE_RETRY_BASE_MS, VOICE_RETRY_MAX_ATTEMPTS, VOICE_RETRY_MAX_DELAY_MS, type VoiceRoom, type VoiceRoomAdapter, type VoiceSessionState } from "./voiceRoomSession.ts";
import { VoiceTokenError } from "./voiceToken.ts";
import * as officeMedia from "./officeMediaSession.ts";
import type { VoiceTarget } from "./voiceTarget.ts";

const FLUSH_MICROTASK_COUNT = 40;
const EXPECTED_RETRY_MULTIPLIER = 2;
const HTTP_FORBIDDEN_STATUS = 403;
const HTTP_UNAUTHORIZED_STATUS = 401;
const target: VoiceTarget = { kind: "meeting", id: "A", officeId: "office", sessionKey: "session" };
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
class FakeRoom implements VoiceRoom {
  private handlers = new Map<keyof RoomEventCallbacks, unknown>();
  connection = deferred();
  reset = deferred();
  disconnectCount = 0;
  teardown: Promise<void> = Promise.resolve();
  microphone: boolean[] = [];
  localParticipant = {
    setMicrophoneEnabled: async (enabled: boolean) => { this.microphone.push(enabled); await this.reset.promise; return undefined; },
    isCameraEnabled: false,
    isScreenShareEnabled: false,
    setCameraEnabled: async () => { this.localParticipant.isCameraEnabled = false; return undefined; },
    setScreenShareEnabled: async () => undefined,
  };
  on<E extends keyof RoomEventCallbacks>(event: E, listener: RoomEventCallbacks[E]): this { this.handlers.set(event, listener); return this; }
  off<E extends keyof RoomEventCallbacks>(event: E, listener: RoomEventCallbacks[E]): this { if (this.handlers.get(event) === listener) this.handlers.delete(event); return this; }
  disconnectedHandler() { return this.handlers.get(RoomEvent.Disconnected) as RoomEventCallbacks[RoomEvent.Disconnected]; }
  emitDisconnected(reason = DisconnectReason.UNKNOWN_REASON) { (this.handlers.get(RoomEvent.Disconnected) as RoomEventCallbacks[RoomEvent.Disconnected])?.(reason); }
  emitReconnecting() { (this.handlers.get(RoomEvent.Reconnecting) as RoomEventCallbacks[RoomEvent.Reconnecting])?.(); }
  connect = async () => this.connection.promise;
  disconnect = async () => { this.disconnectCount++; this.connection.reject(ConnectionError.cancelled("SDK cancellation")); await this.teardown; };
  ready() { this.connection.resolve(); this.reset.resolve(); }
}
function adapter(room: FakeRoom): VoiceRoomAdapter<FakeRoom> {
  return {
    room, events: RoomEvent,
    disconnectError: reason => reason === DisconnectReason.CLIENT_INITIATED
      ? ConnectionError.cancelled("Voice disconnected.")
      : ConnectionError.leaveRequest("Voice disconnected.", reason ?? DisconnectReason.UNKNOWN_REASON),
    authorizationDenied: error => error instanceof ConnectionError
      && (error.status === HTTP_UNAUTHORIZED_STATUS || error.status === HTTP_FORBIDDEN_STATUS),
  };
}
async function flush() { for (let index = 0; index < FLUSH_MICROTASK_COUNT; index++) await Promise.resolve(); }
function fixture(createSession = (dependencies: ConstructorParameters<typeof VoiceRoomSession<FakeRoom>>[0], listener: ConstructorParameters<typeof VoiceRoomSession<FakeRoom>>[1]) => new VoiceRoomSession(dependencies, listener)) {
  const rooms: FakeRoom[] = [];
  const states: VoiceSessionState[] = [];
  const tokens: string[] = [];
  const notices: string[] = [];
  const timers: Array<{ callback: () => void; delay: number }> = [];
  let tokenError: Error | null = null;
  const session = createSession({
    createRoom: async () => { const room = new FakeRoom(); rooms.push(room); return adapter(room); },
    fetchToken: async (_target, signal) => {
      if (tokenError) throw tokenError;
      if (signal.aborted) throw new Error("Aborted fixture token");
      const token = `token-${tokens.length}`; tokens.push(token); return { url: "wss://fixture", token };
    },
    schedule: (callback, delay) => { const timer = { callback, delay }; timers.push(timer); return () => { const index = timers.indexOf(timer); if (index >= 0) timers.splice(index, 1); }; },
  }, { stateChanged: state => states.push(state), mediaStopped: () => notices.push("stopped") });
  return { session, rooms, states, tokens, timers, notices, setTokenError: (error: Error) => { tokenError = error; } };
}
async function join(f: ReturnType<typeof fixture>) { f.session.setTarget(target); await flush(); f.rooms[0]!.ready(); await flush(); }

test("regression: meeting A→B joins B and disconnects A first", async () => {
  const f = fixture(); await join(f); f.session.setTarget({ ...target, id: "B" }); await flush();
  assert.equal(f.rooms[0]!.disconnectCount, 1); assert.equal(f.rooms.length, 2);
  f.rooms[1]!.ready(); await flush(); assert.equal(f.states.at(-1)?.target?.id, "B"); assert.equal(f.states.at(-1)?.connected, true);
});
test("regression: owned connect cancellation never sets error", async () => {
  const f = fixture(); f.session.setTarget(target); await flush(); f.session.leave(); await flush();
  assert.ok(f.states.every(state => state.error === null)); assert.equal(f.states.at(-1)?.connected, false);
});
test("regression: unexpected disconnect recovers using a fresh token", async () => {
  const f = fixture(); await join(f); f.rooms[0]!.emitDisconnected(); await flush();
  f.timers.shift()!.callback(); await flush(); f.rooms[1]!.ready(); await flush();
  assert.equal(f.tokens.length, 2); assert.notEqual(f.tokens[0], f.tokens[1]); assert.equal(f.states.at(-1)?.connected, true);
});
test("regression: leave during reset cannot mark a dead room connected", async () => {
  const f = fixture(); f.session.setTarget(target); await flush(); f.rooms[0]!.connection.resolve(); await flush(); f.session.leave(); f.rooms[0]!.reset.resolve(); await flush();
  assert.equal(f.states.at(-1)?.connected, false);
});
test("regression: old room disconnect cannot clear a newer room", async () => {
  const f = fixture(); await join(f); const oldHandler = f.rooms[0]!.disconnectedHandler(); f.session.setTarget({ ...target, id: "B" }); await flush(); f.rooms[1]!.ready(); await flush(); oldHandler(DisconnectReason.UNKNOWN_REASON); await flush();
  assert.equal(f.states.at(-1)?.connected, true); assert.equal(f.states.at(-1)?.target?.id, "B");
});
test("preservation: pause leaves all rooms, identical targets coalesce", async () => {
  const f = fixture(); await join(f); f.session.setTarget({ ...target }); await flush(); assert.equal(f.rooms.length, 1);
  f.session.setTarget(null); await flush(); assert.equal(f.rooms[0]!.disconnectCount, 1); assert.equal(f.states.at(-1)?.connected, false);
});
test("preservation: 403 reports status and never retries", async () => {
  const f = fixture(); f.setTokenError(new VoiceTokenError("Denied", HTTP_FORBIDDEN_STATUS)); f.session.setTarget(target); await flush();
  assert.equal(f.timers.length, 0); const error = f.states.at(-1)?.error; assert.ok(error instanceof VoiceTokenError); assert.equal(error.status, HTTP_FORBIDDEN_STATUS);
});
test("preservation: stale private/proximity token responses are ignored", async () => {
  for (const kind of ["private", "proximity"] as const) {
    const pending = deferred(); let roomCount = 0;
    const session = new VoiceRoomSession({ createRoom: async () => { roomCount++; return adapter(new FakeRoom()); }, fetchToken: async () => { await pending.promise; return { url: "url", token: "token" }; } }, { stateChanged() {} });
    session.setTarget({ ...target, kind }); await flush(); session.leave(); pending.resolve(); await flush(); assert.equal(roomCount, 0);
  }
});
test("retry cap spans fetch/connect failures and exponential delay is capped; manual reconnect resets", async () => {
  const f = fixture(); f.setTokenError(ConnectionError.timeout("Unavailable")); f.session.setTarget(target); await flush();
  for (let attempt = 0; attempt < VOICE_RETRY_MAX_ATTEMPTS; attempt++) {
    const timer = f.timers.shift()!;
    assert.equal(timer.delay, Math.min(VOICE_RETRY_BASE_MS * EXPECTED_RETRY_MULTIPLIER ** attempt, VOICE_RETRY_MAX_DELAY_MS)); timer.callback(); await flush();
  }
  assert.equal(f.timers.length, 0); assert.equal(f.states.at(-1)?.retryExhausted, true);
  f.session.reconnect(); await flush(); assert.equal(f.timers.length, 1);
});
test("suspend cancels retries; resume requires a freshly resolved target", async () => {
  const f = fixture(); await join(f); f.rooms[0]!.emitDisconnected(); await flush(); f.session.suspend(); await flush(); assert.equal(f.timers.length, 0);
  f.session.setTarget(target); await flush(); assert.equal(f.rooms.length, 1); f.session.resume({ ...target, id: "B" }); await flush(); assert.equal(f.rooms.length, 2);
  f.session.dispose(); f.session.resume(target); await flush(); assert.equal(f.rooms.length, 2);
});
test("SDK reconnecting is left alone until disconnected", async () => {
  const f = fixture(); await join(f); f.rooms[0]!.emitReconnecting(); await flush(); assert.equal(f.timers.length, 0); assert.equal(f.rooms[0]!.disconnectCount, 0);
});
test("mute intent is kept across a switch; controls during join are queued", async () => {
  const f = fixture(); await join(f); await f.session.setMuted(false); f.session.setTarget({ ...target, id: "B" }); await flush(); f.rooms[1]!.ready(); await flush();
  assert.equal(f.rooms[1]!.microphone.at(-1), true); assert.equal(f.states.at(-1)?.muted, false);
  f.session.setTarget({ ...target, id: "C" }); await flush(); const control = f.session.setMuted(true); f.rooms[2]!.ready(); await control; await flush(); assert.equal(f.states.at(-1)?.muted, true);
});
test("current SDK cancellation is reported and retried", async () => {
  const f = fixture(); f.session.setTarget(target); await flush(); f.rooms[0]!.connection.reject(ConnectionError.cancelled("Not owned")); await flush();
  assert.equal(f.states.at(-1)?.error, null); assert.equal(f.timers.length, 1);
  for (let attempt = 0; attempt < VOICE_RETRY_MAX_ATTEMPTS; attempt++) {
    f.timers.shift()!.callback(); await flush();
    f.rooms.at(-1)!.connection.reject(ConnectionError.cancelled("Not owned")); await flush();
  }
  const error = f.states.at(-1)?.error; assert.ok(error instanceof ConnectionError);
  assert.equal(error.reason, ConnectionError.cancelled("fixture").reason); assert.equal(f.states.at(-1)?.retryExhausted, true);
});

test("serial teardown prevents overlapping rooms even across multiple targets", async () => {
  const f = fixture(); await join(f); const teardown = deferred(); f.rooms[0]!.teardown = teardown.promise;
  f.session.setTarget({ ...target, id: "B" }); f.session.setTarget({ ...target, id: "C" }); await flush(); assert.equal(f.rooms.length, 1);
  teardown.resolve(); await flush(); assert.equal(f.rooms.length, 2); f.rooms[1]!.ready(); await flush(); assert.equal(f.states.at(-1)?.target?.id, "C");
});
test("stale control completion never changes mute intent of a newer generation", async () => {
  const f = fixture(); await join(f); const control = deferred(); f.rooms[0]!.reset = control;
  const muting = f.session.setMuted(false); await flush(); f.session.setTarget({ ...target, id: "B" }); await flush(); f.rooms[1]!.ready(); await flush(); control.resolve(); await muting; await flush();
  assert.equal(f.states.at(-1)?.muted, true); assert.equal(f.rooms[1]!.microphone.at(-1), false);
});

test("a pending control in an old room cannot block controls in a new room", async () => {
  const f = fixture();
  await join(f);
  const permission = deferred();
  const oldControl = f.session.control(async () => permission.promise);
  await flush();

  f.session.setTarget({ ...target, id: "B" });
  await flush();
  f.rooms[1]!.ready();
  await flush();
  const newControl = f.session.setMuted(false);
  await flush();

  try {
    assert.equal(f.rooms[1]!.microphone.at(-1), true);
    assert.equal(f.states.at(-1)?.muted, false);
  } finally {
    permission.resolve();
    await oldControl;
    await newControl;
    await f.session.dispose();
  }
});

test("an old control finishing cannot release a newer room's control queue", async () => {
  const f = fixture();
  await join(f);
  const oldPermission = deferred();
  const oldControl = f.session.control(async () => oldPermission.promise);
  await flush();
  f.session.setTarget({ ...target, id: "B" });
  await flush();
  f.rooms[1]!.ready();
  await flush();

  const newPermission = deferred();
  let secondControlRan = false;
  const firstControl = f.session.control(async () => newPermission.promise);
  await flush();
  oldPermission.resolve();
  await oldControl;
  const secondControl = f.session.control(async () => { secondControlRan = true; });
  await flush();

  try {
    assert.equal(secondControlRan, false);
  } finally {
    newPermission.resolve();
    await firstControl;
    await secondControl;
    await f.session.dispose();
  }
  assert.equal(secondControlRan, true);
});
test("401 stops the generation; a new authoritative target gets a fresh attempt", async () => {
  const f = fixture(); f.setTokenError(new VoiceTokenError("Expired", HTTP_UNAUTHORIZED_STATUS)); f.session.setTarget(target); await flush(); assert.equal(f.timers.length, 0);
  f.session.setTarget({ ...target, id: "B" }); await flush(); assert.equal(f.states.at(-1)?.target?.id, "B"); assert.equal(f.timers.length, 0);
});
test("browser and realtime suspensions must both resume before joining", async () => {
  const f = fixture(); await join(f); f.session.suspend("browser"); f.session.suspend("realtime"); f.session.resume(target, "browser"); await flush(); assert.equal(f.rooms.length, 1);
  f.session.resume(target, "realtime"); await flush(); assert.equal(f.rooms.length, 2);
});
test("SDK client-initiated disconnect on the current room is reported", async () => {
  const f = fixture(); await join(f); f.rooms[0]!.emitDisconnected(DisconnectReason.CLIENT_INITIATED); await flush();
  assert.equal(f.states.at(-1)?.error, null); assert.equal(f.timers.length, 1);
  for (let attempt = 0; attempt < VOICE_RETRY_MAX_ATTEMPTS; attempt++) {
    f.timers.shift()!.callback(); await flush();
    f.rooms.at(-1)!.emitDisconnected(DisconnectReason.CLIENT_INITIATED); await flush();
  }
  assert.ok(f.states.at(-1)?.error instanceof ConnectionError); assert.equal(f.states.at(-1)?.retryExhausted, true);
});
test("fetch/connect/disconnect failures share a retry budget within one outage", async () => {
  const f = fixture(); await join(f); f.rooms[0]!.emitDisconnected(); await flush();
  f.timers.shift()!.callback(); await flush(); f.rooms[1]!.connection.reject(ConnectionError.timeout("Connect failed")); await flush();
  f.setTokenError(ConnectionError.timeout("Fetch failed"));
  for (let attempt = 2; attempt <= VOICE_RETRY_MAX_ATTEMPTS; attempt++) { f.timers.shift()!.callback(); await flush(); }
  assert.equal(f.timers.length, 0); assert.equal(f.states.at(-1)?.retryExhausted, true);
});
test("a replacement controller waits for disposal teardown and keeps microphone intent", async () => {
  const f = fixture(); await join(f); await f.session.setMuted(false); const teardown = deferred(); f.rooms[0]!.teardown = teardown.promise;
  const disposed = f.session.dispose(); const rooms: FakeRoom[] = [];
  const replacement = new VoiceRoomSession({
    createRoom: async () => { const room = new FakeRoom(); rooms.push(room); return adapter(room); },
    fetchToken: async () => ({ url: "url", token: "fresh" }),
    initialMuted: false, previousTeardown: disposed,
  }, { stateChanged() {} });
  replacement.setTarget({ ...target, sessionKey: "new-session" }); await flush(); assert.equal(rooms.length, 0);
  teardown.resolve(); await flush(); assert.equal(rooms.length, 1); rooms[0]!.ready(); await flush(); assert.equal(rooms[0]!.microphone.at(-1), true);
});

test("camera/share stop notification survives SDK clearing publications before disconnect", async () => {
  const f = fixture(); await join(f);
  await f.session.control(async room => { room.localParticipant.isCameraEnabled = true; });
  f.rooms[0]!.localParticipant.isCameraEnabled = false;
  f.rooms[0]!.emitDisconnected(); await flush(); assert.deepEqual(f.notices, ["stopped"]);
  f.timers.shift()!.callback(); await flush(); f.rooms[1]!.ready(); await flush(); assert.equal(f.rooms[1]!.localParticipant.isCameraEnabled, false);
});
test("duplicate browser resume/pageshow events coalesce into one recovery", async () => {
  const f = fixture(); await join(f); f.session.suspend("browser"); f.session.resume(target, "browser"); await flush();
  f.rooms[1]!.ready(); await flush(); f.session.resume(target, "browser"); await flush();
  assert.equal(f.rooms.length, 2); assert.equal(f.rooms[1]!.disconnectCount, 0); assert.equal(f.states.at(-1)?.connected, true);
});

test("regression fix1: budget resets after a successful join", async () => {
  const f = fixture(); await join(f);
  f.rooms[0]!.emitDisconnected(); await flush();
  f.timers.shift()!.callback(); await flush(); f.rooms[1]!.ready(); await flush();
  f.rooms[1]!.emitDisconnected(); await flush();
  assert.equal(f.timers[0]!.delay, VOICE_RETRY_BASE_MS);
  assert.equal(f.states.at(-1)?.retryExhausted, false);
});
test("regression fix1: transient failures remain busy without publishing alerts", async () => {
  const f = fixture(); await join(f); f.rooms[0]!.emitDisconnected(); await flush();
  assert.ok(f.states.every(state => state.error === null));
  assert.equal(f.states.at(-1)?.busy, true);
  f.setTokenError(new VoiceTokenError("Denied", HTTP_FORBIDDEN_STATUS));
  f.timers.shift()!.callback(); await flush();
  assert.equal(f.timers.length, 0);
  assert.equal(f.states.at(-1)?.busy, false);
  assert.ok(f.states.at(-1)?.error instanceof VoiceTokenError);
});
test("regression fix1: rejected disconnect settles and permits a later manual join", async () => {
  const f = fixture(); await join(f);
  const teardown = deferred(); f.rooms[0]!.teardown = teardown.promise;
  f.session.leave(); teardown.reject(new Error("Disconnect failed")); await flush();
  assert.equal(f.states.at(-1)?.error?.message, "Disconnect failed");
  f.session.setTarget(target); await flush();
  assert.equal(f.rooms.length, 2);
  f.rooms[1]!.ready(); await flush();
  assert.equal(f.states.at(-1)?.connected, true);
});

test("lazy room creation invalidated during loading is torn down before the next join", async () => {
  const loading = deferred(); const teardown = deferred(); const stale = new FakeRoom();
  stale.teardown = teardown.promise;
  // An unconnected fake must not reject a connect promise nobody awaits.
  stale.connection.resolve();
  const rooms: FakeRoom[] = [];
  const session = new VoiceRoomSession({
    createRoom: async () => {
      if (!rooms.length) { rooms.push(stale); await loading.promise; return adapter(stale); }
      const room = new FakeRoom(); rooms.push(room); return adapter(room);
    },
    fetchToken: async () => ({ url: "url", token: "token" }),
  }, { stateChanged() {} });
  session.setTarget(target); await flush(); session.setTarget({ ...target, id: "B" });
  loading.resolve(); await flush(); assert.equal(stale.disconnectCount, 1); assert.equal(rooms.length, 1);
  teardown.resolve(); await flush(); assert.equal(rooms.length, 2); rooms[1]!.ready(); await flush();
  await session.dispose();
});
test("preservation: current stale-proximity token response clears busy without joining", async () => {
  const states: VoiceSessionState[] = []; let roomCount = 0;
  const session = new VoiceRoomSession({
    createRoom: async () => { roomCount++; return adapter(new FakeRoom()); },
    fetchToken: async () => null,
  }, { stateChanged: state => states.push(state) });
  session.setTarget({ ...target, kind: "proximity" }); await flush();
  assert.equal(roomCount, 0); assert.equal(states.at(-1)?.busy, false); assert.equal(states.at(-1)?.error, null);
});

test('a second spotlight session keeps its room and microphone during zone transitions', async () => {
  const zone = fixture();
  const spotlight = fixture();
  zone.session.setTarget(target);
  spotlight.session.setTarget({ ...target, kind: 'spotlight', id: 'spotlight-epoch' });
  await flush();
  zone.rooms[0].ready(); spotlight.rooms[0].ready();
  await flush();
  await spotlight.session.setMuted(false);
  zone.session.setTarget({ ...target, id: 'meeting-b' });
  await flush();
  assert.equal(spotlight.rooms.length, 1);
  assert.equal(spotlight.rooms[0].disconnectCount, 0);
  assert.equal(spotlight.rooms[0].microphone.at(-1), true);
  assert.equal(spotlight.states.at(-1)?.connected, true);
  await zone.session.dispose(); await spotlight.session.dispose();
});

test("office media sessions isolate zone target changes from spotlight teardown", async () => {
  const zone = fixture(officeMedia.createOfficeMediaSession);
  const spotlight = fixture(officeMedia.createOfficeMediaSession);
  assert.notEqual(zone.session, spotlight.session);
  await join(zone);
  spotlight.session.setTarget({ ...target, kind: "spotlight", id: "epoch" });
  await flush();
  spotlight.rooms[0]!.ready();
  await flush();
  zone.session.setTarget({ ...target, id: "B" });
  await flush();
  assert.equal(spotlight.rooms[0]!.disconnectCount, 0);
  assert.equal(spotlight.states.at(-1)?.target?.id, "epoch");
  assert.equal(spotlight.states.at(-1)?.connected, true);
  assert.notEqual(zone.session, spotlight.session);
  await zone.session.dispose();
  await spotlight.session.dispose();
});
