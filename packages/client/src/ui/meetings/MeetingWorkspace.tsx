import { useId, useState, type ReactNode } from "react";
import { WorkspaceDialog } from "../workspace/WorkspaceDialog";
import { MeetingParticipantTile } from "./MeetingParticipantTile";
import { reconcileMeetingViewState, resolveMeetingStage, sortMeetingParticipants, type MeetingParticipant, type MeetingStage, type MeetingViewState } from "./meetingViewState";
import { MeetingShareStage } from "./MeetingShareStage";
import "./MeetingWorkspace.css";

const DEFAULT_TITLE_LABEL = "Conversation";
const OFFICE_VIEW_LABEL = "Return to Office";
const GRID_LABEL = "Grid";
const SPEAKER_LABEL = "Active speaker";
const EMPTY_CONVERSATION_LABEL = "No active conversation";
const EMPTY_CONVERSATION_HINT_LABEL = "Return to the office to find someone to talk to.";
const PARTICIPANTS_LABEL = "Conversation participants";
const SHARES_LABEL = "Shared screens";
const VIEW_LABEL = "Meeting view";
const LAYOUT_LABEL = "Meeting layout";
const MEDIA_CONTROLS_LABEL = "Meeting media controls";
const SELECTED_SHARE_LABEL = "Selected screen share";
const SELECTED_PARTICIPANT_LABEL = "Selected participant";
const PARTICIPANT_COUNT_SINGULAR_LABEL = "participant";
const PARTICIPANT_COUNT_PLURAL_LABEL = "participants";
const SCREEN_SUFFIX_LABEL = " · Screen";
const EMPTY_CONVERSATION_KEY = "no-conversation";

export interface MeetingWorkspaceProps {
  participants: readonly MeetingParticipant[];
  conversationKey: string | null;
  title?: string;
  onOfficeView(): void;
  controls?: ReactNode;
  hands?: ReactNode;
}
type ViewActions = {
  state: MeetingViewState;
  onLayout(layout: MeetingViewState["layout"]): void;
  onOfficeView(): void;
};
/** A conversation change resets presentation only. Room ownership stays in the coordinator. */
export function MeetingWorkspace(props: MeetingWorkspaceProps) {
  return <MeetingWorkspaceContent key={props.conversationKey ?? EMPTY_CONVERSATION_KEY} {...props} />;
}
export function MeetingViewDialog(props: MeetingWorkspaceProps) {
  const headingId = useId();
  return <WorkspaceDialog labelledBy={headingId} onClose={props.onOfficeView} className="meeting-view-dialog">
    <h2 id={headingId} className="meeting-dialog-title">{VIEW_LABEL}</h2>
    <MeetingWorkspace {...props} />
  </WorkspaceDialog>;
}
function MeetingHeader({ title, count, state, onLayout, onOfficeView }: ViewActions & { title: string; count: number }) {
  const gridSelected = state.layout === "grid" && !state.pinnedMemberId && !state.selectedShareId;
  const speakerSelected = state.layout === "speaker" && !state.pinnedMemberId && !state.selectedShareId;
  return <header className="meeting-workspace-header">
    <div><h2>{title}</h2><span>{count} {count === 1 ? PARTICIPANT_COUNT_SINGULAR_LABEL : PARTICIPANT_COUNT_PLURAL_LABEL}</span></div>
    <div className="meeting-view-actions">
      <div className="meeting-layout-controls" role="group" aria-label={LAYOUT_LABEL}>
        <button type="button" aria-pressed={gridSelected} onClick={() => onLayout("grid")}>{GRID_LABEL}</button>
        <button type="button" aria-pressed={speakerSelected} onClick={() => onLayout("speaker")}>{SPEAKER_LABEL}</button>
      </div>
      <button type="button" className="meeting-office-button" onClick={onOfficeView}>{OFFICE_VIEW_LABEL}</button>
    </div>
  </header>;
}
function MeetingStageView({ stage, conversationKey, pinnedMemberId, onPin }: { stage: MeetingStage; conversationKey: string | null; pinnedMemberId: string | null; onPin(memberId: string): void }) {
  const label = stage.kind === "share" ? SELECTED_SHARE_LABEL : SELECTED_PARTICIPANT_LABEL;
  return <section className="meeting-stage" aria-label={label}>
    {stage.kind === "share"
      ? <MeetingShareStage key={stage.share.id} conversationKey={conversationKey} share={stage.share} participantName={stage.participant.displayName} />
      : <MeetingParticipantTile participant={stage.participant} pinned={pinnedMemberId === stage.participant.memberId} onPin={() => onPin(stage.participant.memberId)} />}
  </section>;
}
function MeetingShares({ participants, selectedShareId, onShare }: {
  participants: readonly MeetingParticipant[]; selectedShareId: string | null; onShare(shareId: string): void;
}) {
  if (!participants.some(person => person.screenShares.length > 0)) return null;
  return <section className="meeting-shares" aria-label={SHARES_LABEL}>
    {participants.flatMap(person => person.screenShares.map(share =>
      <button key={share.id} type="button" aria-pressed={selectedShareId === share.id} onClick={() => onShare(share.id)}>
        {share.label ?? `${person.displayName}${SCREEN_SUFFIX_LABEL}`}
      </button>))}
  </section>;
}
function MeetingWorkspaceContent({ participants, conversationKey, title = DEFAULT_TITLE_LABEL, onOfficeView, controls, hands }: MeetingWorkspaceProps) {
  const [selection, setSelection] = useState<MeetingViewState>({ layout: "grid", pinnedMemberId: null, selectedShareId: null });
  const state = reconcileMeetingViewState(selection, participants);
  // Clear departed selections immediately so a later rejoin cannot resurrect a stale pin.
  if (state !== selection) setSelection(state);
  const ordered = sortMeetingParticipants(participants);
  const stage = resolveMeetingStage(ordered, state);
  const remaining = ordered.filter(person => stage?.kind !== "participant" || stage.participant.memberId !== person.memberId);
  const pin = (memberId: string) => setSelection(current => ({ ...current,
    pinnedMemberId: current.pinnedMemberId === memberId ? null : memberId, selectedShareId: null }));
  const chooseLayout = (layout: MeetingViewState["layout"]) => setSelection({ layout, pinnedMemberId: null, selectedShareId: null });
  const chooseShare = (shareId: string) => setSelection(current => ({ ...current,
    selectedShareId: current.selectedShareId === shareId ? null : shareId, pinnedMemberId: null }));
  return <section className="meeting-workspace" aria-label={VIEW_LABEL}>
    <MeetingHeader title={title} count={participants.length} state={state} onLayout={chooseLayout} onOfficeView={onOfficeView} />
    {hands}
    {participants.length === 0 ? <div className="meeting-empty-state" role="status"><h3>{EMPTY_CONVERSATION_LABEL}</h3><p>{EMPTY_CONVERSATION_HINT_LABEL}</p></div> : null}
    {stage ? <MeetingStageView stage={stage} conversationKey={conversationKey} pinnedMemberId={state.pinnedMemberId} onPin={pin} /> : null}
    <section className={`meeting-participant-grid${stage ? " with-stage" : ""}`} aria-label={PARTICIPANTS_LABEL}>
      {remaining.map(person => <MeetingParticipantTile key={person.memberId} participant={person} pinned={state.pinnedMemberId === person.memberId} onPin={() => pin(person.memberId)} />)}
    </section>
    <MeetingShares participants={ordered} selectedShareId={state.selectedShareId} onShare={chooseShare} />
    {controls ? <div className="meeting-workspace-controls" aria-label={MEDIA_CONTROLS_LABEL}>{controls}</div> : null}
  </section>;
}
