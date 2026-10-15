import assert from "node:assert/strict";
import test from "node:test";
import { createMeetingShareState, fitMeetingShare, reconcileMeetingShareState, zoomMeetingShare } from "./meetingShareState";

const CONVERSATION_ID = "meeting-a";
const FIRST_SHARE_ID = "screen-alice";
const SECOND_SHARE_ID = "screen-bob";
const ZOOM_TEST_STEPS_COUNT = 20;

test("share zoom uses bounded 25 percent steps and Fit returns to 100 percent", () => {
  const fit = createMeetingShareState(CONVERSATION_ID, FIRST_SHARE_ID);
  assert.equal(fit.zoomPercent, 100);
  assert.equal(zoomMeetingShare(fit, -1), fit);
  const enlarged = zoomMeetingShare(fit, 1);
  assert.equal(enlarged.zoomPercent, 125);
  let maximum = enlarged;
  for (let step = 0; step < ZOOM_TEST_STEPS_COUNT; step += 1) maximum = zoomMeetingShare(maximum, 1);
  assert.equal(maximum.zoomPercent, 300);
  assert.equal(zoomMeetingShare(maximum, 1), maximum);
  assert.equal(fitMeetingShare(maximum).zoomPercent, 100);
  assert.equal(fitMeetingShare(fit), fit);
});

test("selected share and conversation changes reset zoom while unchanged identity preserves it", () => {
  const enlarged = zoomMeetingShare(createMeetingShareState(CONVERSATION_ID, FIRST_SHARE_ID), 1);
  assert.equal(reconcileMeetingShareState(enlarged, CONVERSATION_ID, FIRST_SHARE_ID), enlarged);
  const switched = reconcileMeetingShareState(enlarged, CONVERSATION_ID, SECOND_SHARE_ID);
  assert.equal(switched.zoomPercent, 100);
  assert.equal(switched.shareId, SECOND_SHARE_ID);
  assert.equal(reconcileMeetingShareState(enlarged, "meeting-b", FIRST_SHARE_ID).zoomPercent, 100);
});

test("ended share clears zoom permanently before a later publication with the same id", () => {
  const enlarged = zoomMeetingShare(createMeetingShareState(CONVERSATION_ID, FIRST_SHARE_ID), 1);
  const ended = reconcileMeetingShareState(enlarged, CONVERSATION_ID, null);
  assert.equal(ended.shareId, null);
  assert.equal(ended.zoomPercent, 100);
  assert.equal(reconcileMeetingShareState(ended, CONVERSATION_ID, FIRST_SHARE_ID).zoomPercent, 100);
});
