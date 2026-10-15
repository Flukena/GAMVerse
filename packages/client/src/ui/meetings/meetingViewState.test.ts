import assert from "node:assert/strict";
import test from "node:test";
import { reconcileMeetingViewState, resolveMeetingStage, sortMeetingParticipants, type MeetingParticipant, type MeetingVideoTrack, type MeetingViewState } from "./meetingViewState";

function participant(memberId: string): MeetingParticipant {
  return { memberId, username: memberId, displayName: memberId, local: false, speaking: false, microphoneMuted: true,
    mediaState: "connected", cameraTrack: null, screenShares: [] };
}
const grid: MeetingViewState = { layout: "grid", pinnedMemberId: null, selectedShareId: null };
test("grid includes camera-off and unavailable admitted members and chooses no stage", () => {
  const participants = [participant("bob"), { ...participant("alice"), mediaState: "unavailable" as const }];
  assert.deepEqual(sortMeetingParticipants(participants).map(item => item.memberId), ["alice", "bob"]);
  assert.equal(resolveMeetingStage(participants, grid), null);
  assert.equal(participants[0].memberId, "bob", "sorting never mutates the admitted roster");
});
test("pin keeps a camera-off member on stage and departure clears the pin permanently", () => {
  const alice = participant("alice");
  const pinned = { ...grid, pinnedMemberId: "alice" };
  const stage = resolveMeetingStage([alice], pinned);
  assert.equal(stage?.kind, "participant");
  assert.equal(stage?.participant.memberId, "alice");
  const cleaned = reconcileMeetingViewState(pinned, []);
  assert.equal(cleaned.pinnedMemberId, null);
  assert.equal(resolveMeetingStage([alice], cleaned), null);
});
test("speaker view prefers an actual remote speaker, otherwise stable remote then local fallback", () => {
  const local = { ...participant("a-local"), local: true, speaking: true };
  const alice = participant("alice");
  const bob = { ...participant("bob"), speaking: true };
  const state = { ...grid, layout: "speaker" as const };
  assert.equal(resolveMeetingStage([local, alice, bob], state)?.participant.memberId, "bob");
  assert.equal(resolveMeetingStage([local, alice], state)?.participant.memberId, "a-local");
  local.speaking = false;
  assert.equal(resolveMeetingStage([local, alice], state)?.participant.memberId, "alice");
  assert.equal(resolveMeetingStage([], state), null);
});
test("screen selection is explicit and ended sharing falls back without losing layout", () => {
  const track: MeetingVideoTrack = { attach: () => undefined, detach: () => undefined };
  const alice = { ...participant("alice"), screenShares: [{ id: "share-alice", track }] };
  const bob = participant("bob");
  const state: MeetingViewState = { layout: "speaker", pinnedMemberId: null, selectedShareId: "share-alice" };
  const stage = resolveMeetingStage([bob, alice], state);
  assert.equal(stage?.kind, "share");
  assert.equal(stage?.participant.memberId, "alice");
  const cleaned = reconcileMeetingViewState(state, [bob]);
  assert.equal(cleaned.selectedShareId, null);
  assert.equal(cleaned.layout, "speaker");
  assert.equal(resolveMeetingStage([bob], cleaned)?.participant.memberId, "bob");
});
test("unchanged roster preserves view state identity and pin outranks current speakers", () => {
  const alice = participant("alice");
  const bob = { ...participant("bob"), speaking: true };
  const state = { ...grid, layout: "speaker" as const, pinnedMemberId: "alice" };
  assert.equal(reconcileMeetingViewState(state, [alice, bob]), state);
  assert.equal(resolveMeetingStage([bob, alice], state)?.participant.memberId, "alice");
  assert.equal(resolveMeetingStage([alice, bob], state)?.participant.memberId, "alice");
});


test("two concurrent shares remain independently selectable and ending the other share preserves selection", () => {
  const track: MeetingVideoTrack = { attach: () => undefined, detach: () => undefined };
  const alice = { ...participant("alice"), screenShares: [{ id: "screen-alice", track }] };
  const bob = { ...participant("bob"), screenShares: [{ id: "screen-bob", track }] };
  for (const [selectedShareId, memberId] of [["screen-alice", "alice"], ["screen-bob", "bob"]]) {
    const state = { ...grid, selectedShareId };
    const stage = resolveMeetingStage([alice, bob], state);
    assert.equal(stage?.kind, "share");
    assert.equal(stage?.participant.memberId, memberId);
  }
  const selected = { ...grid, selectedShareId: "screen-alice" };
  const unselectedEnded = [alice, participant("bob")];
  assert.equal(reconcileMeetingViewState(selected, unselectedEnded), selected);
  assert.equal(resolveMeetingStage(unselectedEnded, selected)?.participant.memberId, "alice");
  const selectedEnded = reconcileMeetingViewState(selected, [participant("alice"), bob]);
  assert.equal(selectedEnded.selectedShareId, null);
  assert.equal(resolveMeetingStage([participant("alice"), bob], selectedEnded), null);
  assert.equal(resolveMeetingStage([alice, bob], selectedEnded), null, "ended selection never resurrects automatically");
});
