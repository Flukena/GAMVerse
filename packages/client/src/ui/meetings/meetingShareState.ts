export const MEETING_SHARE_FIT_PERCENT = 100;
export const MEETING_SHARE_ZOOM_STEP_PERCENT = 25;
export const MEETING_SHARE_MAX_ZOOM_PERCENT = 300;

export type MeetingShareState = {
  conversationKey: string | null;
  shareId: string | null;
  zoomPercent: number;
};

export function createMeetingShareState(conversationKey: string | null, shareId: string | null): MeetingShareState {
  return { conversationKey, shareId, zoomPercent: MEETING_SHARE_FIT_PERCENT };
}

export function reconcileMeetingShareState(state: MeetingShareState, conversationKey: string | null, shareId: string | null): MeetingShareState {
  if (state.conversationKey === conversationKey && state.shareId === shareId) return state;
  return createMeetingShareState(conversationKey, shareId);
}

export function zoomMeetingShare(state: MeetingShareState, direction: -1 | 1): MeetingShareState {
  const zoomPercent = Math.min(MEETING_SHARE_MAX_ZOOM_PERCENT,
    Math.max(MEETING_SHARE_FIT_PERCENT, state.zoomPercent + direction * MEETING_SHARE_ZOOM_STEP_PERCENT));
  return zoomPercent === state.zoomPercent ? state : { ...state, zoomPercent };
}

export function fitMeetingShare(state: MeetingShareState): MeetingShareState {
  return state.zoomPercent === MEETING_SHARE_FIT_PERCENT ? state : { ...state, zoomPercent: MEETING_SHARE_FIT_PERCENT };
}
