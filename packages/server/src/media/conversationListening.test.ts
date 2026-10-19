import { PrivateMediaEpochs } from "./privateMediaEpoch.js";
import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { createMeetingAudioToken, createPrivateVoiceToken, createProximityAudioToken } from "./service.js";
const FIXTURE_SIGNING_KEY_BYTES_COUNT = 32;
const FIXTURE_SECRET = randomBytes(FIXTURE_SIGNING_KEY_BYTES_COUNT).toString("hex");
const FIXTURE_GROUP_ID = "a".repeat(24);
const TOKEN_PAYLOAD_SEGMENT_INDEX = 1;
type MediaGrant = {room: string; roomJoin: boolean; canPublish: boolean; canSubscribe: boolean; canPublishData: boolean; canPublishSources: string[]};
function grant(token: string): MediaGrant { return JSON.parse(Buffer.from(token.split(".")[TOKEN_PAYLOAD_SEGMENT_INDEX]!, "base64url").toString()).video as MediaGrant; }
test("actual LiveKit JWTs grant Listen subscription without publishing for every spatial room kind", async () => {
  const saved = {url: process.env.LIVEKIT_URL, key: process.env.LIVEKIT_API_KEY, secret: process.env.LIVEKIT_API_SECRET};
  process.env.LIVEKIT_URL = "wss://media.fixture.test";
  process.env.LIVEKIT_API_KEY = "fixture-key";
  process.env.LIVEKIT_API_SECRET = FIXTURE_SECRET;
  try {
    const descriptor = {officeId:"office",roomIncarnationId:"incarnation",zoneId:"meeting",kind:"meeting" as const,generation:0,epoch:FIXTURE_GROUP_ID,roomName:`zone-${FIXTURE_GROUP_ID}`,available:true,state:"ready" as const};
    const factories = [
      (mode: "listen" | "join" = "join") => createMeetingAudioToken("alice", "alice-fixture", descriptor, mode),
      (mode: "listen" | "join" = "join") => createPrivateVoiceToken("alice", "alice-fixture", {...descriptor,kind:"private",zoneId:"desk"}, mode),
      (mode: "listen" | "join" = "join") => createProximityAudioToken("alice", "alice-fixture", "office", FIXTURE_GROUP_ID, mode),
    ];
    for (const factory of factories) {
      const listen = grant((await factory("listen")).token);
      assert.equal(listen.canPublish, false);
      assert.equal(listen.canSubscribe, true);
      assert.equal(listen.canPublishData, false);
      assert.deepEqual(listen.canPublishSources ?? [], []);
      const joined = grant((await factory("join")).token);
      assert.equal(joined.canPublish, true);
      assert.equal(joined.canPublishSources.length, 3);
      assert.equal(joined.room, listen.room);
      assert.equal(grant((await factory()).token).canPublish, true);
    }
    const epochs = new PrivateMediaEpochs({removeRoom:async()=>{}});
    for (const kind of ["meeting","private"] as const) {
      const key = {officeId:"office",roomIncarnationId:"incarnation",zoneId:"zone",kind};
      const first = epochs.current(key);
      const factory = kind === "meeting" ? createMeetingAudioToken : createPrivateVoiceToken;
      const oldGrant = grant((await factory("alice","alice-fixture",first)).token);
      const transition = epochs.invalidate(key);
      await assert.rejects(factory("alice","alice-fixture",transition.descriptor),/not ready/);
      const next = await transition.settled;
      const newGrant = grant((await factory("alice","alice-fixture",next)).token);
      assert.equal(oldGrant.room,first.roomName);
      assert.equal(newGrant.room,next.roomName);
      assert.notEqual(oldGrant.room,newGrant.room,"old JWT room can never subscribe to the new policy epoch");
      assert.match(newGrant.room,/^zone-[a-f0-9]{24}$/);
    }
  } finally {
    for (const [key, value] of [["LIVEKIT_URL",saved.url],["LIVEKIT_API_KEY",saved.key],["LIVEKIT_API_SECRET",saved.secret]]) {
      if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
    }
  }
});
