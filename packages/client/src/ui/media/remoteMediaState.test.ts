import assert from "node:assert/strict";
import test from "node:test";
import type { RemoteTrack, Room } from "livekit-client";
import { remoteMediaTiles, screenCameraTile, RemoteMediaViewerState } from "./remoteMediaState";

function selection(viewer: RemoteMediaViewerState) { return viewer.snapshot.selected; }
function publication(source: string, sid = source) {
  return {
    source, trackSid: sid, isSubscribed: true, isDesired: true, isMuted: false,
    track: { kind: "video" } as RemoteTrack | undefined,
    subscriptionRequests: [] as boolean[],
    setSubscribed(subscribed: boolean) {
      this.isDesired = subscribed;
      this.subscriptionRequests.push(subscribed);
    },
  };
}
function fixture(...publications: ReturnType<typeof publication>[]) {
  const participant = { identity: "alice-0123456789abcdef", name: "Alice", videoTrackPublications: new Map(publications.map(pub => [pub.trackSid, pub])) };
  const transport = { state: "connected", remoteParticipants: new Map([[participant.identity, participant]]) };
  return { room: transport as unknown as Room, transport, participant };
}

test("viewer includes subscribed unmuted remote video only, with screens before cameras", () => {
  const camera = publication("camera");
  const screen = publication("screen_share");
  const muted = { ...publication("camera", "muted"), isMuted: true };
  const pending = { ...publication("camera", "pending"), isSubscribed: false };
  const missing = { ...publication("camera", "missing"), track: undefined };
  const audio = { ...publication("screen_share_audio"), track: { kind: "audio" } as RemoteTrack };
  const { room, transport } = fixture(camera, muted, pending, missing, audio, screen);
  assert.deepEqual(remoteMediaTiles(room).map(tile => tile.source), ["screen_share", "camera"]);
  assert.equal(remoteMediaTiles(room)[0].username, "alice");
  transport.state = "disconnected";
  assert.deepEqual(remoteMediaTiles(room), []);
});

test("screen shares take focus automatically and the selected publication survives refreshes", () => {
  const camera = publication("camera");
  const { room, participant } = fixture(camera);
  const viewer = new RemoteMediaViewerState();
  viewer.setRoom(room);
  viewer.refresh(room);
  assert.equal(selection(viewer)?.track, camera.track);
  const screen = publication("screen_share");
  participant.videoTrackPublications.set(screen.trackSid, screen);
  viewer.refresh(room);
  assert.equal(selection(viewer)?.track, screen.track, "screen share should take focus automatically");
  assert.equal(viewer.snapshot.minimized, true, "screen sharing opens minimized in the bottom corner");
  const screenKey = viewer.snapshot.tiles.find(tile => tile.source === "screen_share")!.key;
  viewer.open(screenKey);
  viewer.refresh(room);
  assert.equal(selection(viewer)?.track, screen.track);
  screen.track = { kind: "video" } as RemoteTrack;
  viewer.refresh(room);
  assert.equal(selection(viewer)?.track, screen.track, "same selected publication can replace its SDK track");
});

test("an initial screen share opens minimized without a source picker", () => {
  const screen = publication("screen_share");
  const { room } = fixture(screen);
  const viewer = new RemoteMediaViewerState();
  viewer.setRoom(room);
  viewer.refresh(room);
  assert.equal(selection(viewer)?.track, screen.track);
  assert.equal(viewer.snapshot.minimized, true);
});

test("first incoming stream opens whenever no streams are currently selected", () => {
  const { room, participant } = fixture();
  const viewer = new RemoteMediaViewerState();
  viewer.setRoom(room);
  viewer.refresh(room);
  assert.equal(selection(viewer), null);
  const camera = publication("camera");
  participant.videoTrackPublications.set(camera.trackSid, camera);
  viewer.refresh(room);
  assert.equal(selection(viewer)?.track, camera.track);
  participant.videoTrackPublications.clear();
  viewer.refresh(room);
  assert.deepEqual(viewer.snapshot, { tiles: [], selected: null, minimized: false });
  const screen = publication("screen_share");
  participant.videoTrackPublications.set(screen.trackSid, screen);
  viewer.refresh(room);
  assert.equal(selection(viewer)?.track, screen.track);
});

test("unsubscribing the selected share falls back to the remaining camera and clears when muted", () => {
  const camera = publication("camera");
  const screen = publication("screen_share");
  const { room, participant } = fixture(camera, screen);
  const viewer = new RemoteMediaViewerState();
  viewer.setRoom(room);
  viewer.refresh(room);
  assert.equal(selection(viewer)?.track, screen.track);
  participant.videoTrackPublications.delete(screen.trackSid);
  viewer.refresh(room);
  assert.equal(selection(viewer)?.track, camera.track);
  camera.isMuted = true;
  viewer.refresh(room);
  assert.equal(selection(viewer), null);
});

test("room changes clear video immediately and stale room callbacks cannot restore it", () => {
  const old = fixture(publication("camera"));
  const next = fixture(publication("screen_share"));
  const viewer = new RemoteMediaViewerState();
  viewer.setRoom(old.room);
  viewer.refresh(old.room);
  viewer.setRoom(null);
  assert.deepEqual(viewer.snapshot, { tiles: [], selected: null, minimized: false });
  assert.equal(viewer.refresh(old.room), false);
  viewer.setRoom(next.room);
  viewer.refresh(next.room);
  const snapshot = viewer.snapshot;
  assert.equal(viewer.refresh(old.room), false);
  assert.equal(viewer.snapshot, snapshot);
  assert.equal(selection(viewer)?.source, "screen_share");
  viewer.setRoom(old.room);
  viewer.refresh(old.room);
  assert.ok(selection(viewer), "a new room lifecycle selects available media");
});

test("minimize and restore preserve the playing source, fallback stays minimized, and new calls expand", () => {
  const camera = publication("camera");
  const { room, participant } = fixture(camera);
  const viewer = new RemoteMediaViewerState();
  viewer.setRoom(room);
  viewer.refresh(room);
  assert.equal(viewer.snapshot.minimized, false);
  viewer.toggleSize();
  assert.equal(viewer.snapshot.minimized, true);
  assert.equal(selection(viewer)?.track, camera.track);
  const screen = publication("screen_share");
  participant.videoTrackPublications.set(screen.trackSid, screen);
  viewer.refresh(room);
  assert.equal(viewer.snapshot.minimized, true);
  assert.equal(selection(viewer)?.track, screen.track);
  viewer.open(viewer.snapshot.tiles.find(tile => tile.source === "screen_share")!.key);
  assert.equal(viewer.snapshot.minimized, true);
  participant.videoTrackPublications.delete(screen.trackSid);
  viewer.refresh(room);
  assert.equal(selection(viewer)?.track, camera.track);
  assert.equal(viewer.snapshot.minimized, true);
  viewer.toggleSize();
  assert.equal(viewer.snapshot.minimized, false);
  assert.equal(selection(viewer)?.track, camera.track);
  viewer.toggleSize();
  participant.videoTrackPublications.clear();
  viewer.refresh(room);
  assert.equal(viewer.snapshot.minimized, false);
  viewer.toggleSize();
  assert.equal(viewer.snapshot.minimized, false, "stale controls cannot minimize an empty viewer");
  participant.videoTrackPublications.set(screen.trackSid, screen);
  viewer.refresh(room);
  assert.equal(selection(viewer)?.track, screen.track);
  assert.equal(viewer.snapshot.minimized, true, "a new screen share opens minimized in the bottom corner");
});

test("screen camera PiP selects only the screen publisher's subscribed camera", () => {
  const camera = publication("camera");
  const screen = publication("screen_share");
  const { room, participant, transport } = fixture(camera, screen);
  transport.remoteParticipants.set("bob", { identity: "bob", name: "Bob", videoTrackPublications: new Map([["bob-camera", publication("camera", "bob-camera")]]) });
  const tiles = remoteMediaTiles(room);
  const selected = tiles.find(tile => tile.source === "screen_share")!;
  assert.equal(screenCameraTile(tiles, selected)?.track, camera.track);
  const replacementSessionCamera = { ...tiles.find(tile => tile.source === "camera")!, identity: "alice-new-session", key: "alice-new-session:camera2" };
  assert.equal(screenCameraTile([...tiles, replacementSessionCamera], selected)?.track, camera.track);
  assert.equal(screenCameraTile([selected, replacementSessionCamera], selected), undefined, "same username from another LiveKit identity is not the PiP");
  assert.equal(screenCameraTile(tiles, tiles.find(tile => tile.source === "camera")!), undefined);
  camera.isMuted = true;
  const withoutCamera = remoteMediaTiles(room);
  assert.equal(screenCameraTile(withoutCamera, selected), undefined);
  participant.videoTrackPublications.delete(camera.trackSid);
  assert.equal(screenCameraTile(remoteMediaTiles(room), selected), undefined);
  assert.equal(screenCameraTile(tiles, null), undefined);
});

test("switching screen shares subscribes only the selected publisher and camera without repeating requests", () => {
  const aliceCamera = publication("camera");
  const aliceScreen = publication("screen_share");
  const bobCamera = publication("camera", "bob-camera");
  const bobScreen = publication("screen_share", "bob-screen");
  const { room, transport } = fixture(aliceCamera, aliceScreen);
  transport.remoteParticipants.set("bob", {
    identity: "bob", name: "Bob",
    videoTrackPublications: new Map([[bobCamera.trackSid, bobCamera], [bobScreen.trackSid, bobScreen]]),
  });
  const viewer = new RemoteMediaViewerState();
  viewer.setRoom(room);
  viewer.refresh(room);
  assert.equal(aliceCamera.isDesired, true);
  assert.equal(aliceScreen.isDesired, true);
  assert.deepEqual(bobCamera.subscriptionRequests, [false]);
  assert.deepEqual(bobScreen.subscriptionRequests, [false]);

  viewer.open(`bob:${bobScreen.trackSid}`);
  assert.deepEqual(aliceCamera.subscriptionRequests, [false]);
  assert.deepEqual(aliceScreen.subscriptionRequests, [false]);
  assert.deepEqual(bobCamera.subscriptionRequests, [false, true]);
  assert.deepEqual(bobScreen.subscriptionRequests, [false, true]);
  viewer.refresh(room);
  assert.equal(selection(viewer)?.identity, "bob");
  assert.deepEqual(bobCamera.subscriptionRequests, [false, true]);
  assert.deepEqual(bobScreen.subscriptionRequests, [false, true]);
});
