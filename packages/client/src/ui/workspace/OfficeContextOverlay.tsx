import type { ReactNode } from "react";
import { deskNoticeText } from "./officeNoticeText";
import "./OfficeContextOverlay.css";

const OVERLAY_LABEL = "Office notices and room controls";
const RETRY_DESKS_LABEL = "Retry desks";
const DISMISS_MEDIA_NOTICE_LABEL = "Dismiss media notice";
const DISMISS_DESK_NOTICE_LABEL = "Dismiss desk assignment notice";
const DISMISS_LABEL = "Dismiss";
export interface OfficeContextOverlayProps {
  availabilityError?: string | null;
  deskError: string | null;
  desksLoading: boolean;
  onRetryDesks(): void;
  voiceNotice: string | null;
  onDismissVoiceNotice(): void;
  deskAssignmentNotice?: string | null;
  onDismissDeskAssignmentNotice?(): void;
  meetingAction?: ReactNode;
  children?: ReactNode;
}
export function OfficeContextOverlay(props: OfficeContextOverlayProps) {
  return <aside className="office-context-overlay" aria-label={OVERLAY_LABEL}>
    <div className="office-context-overlay-content">
      {props.availabilityError && <div className="office-context-notice" role="alert"><span>{props.availabilityError}</span></div>}
      {props.deskError && <div className="office-context-notice" role="alert">
        <span>{deskNoticeText(props.deskError)}</span><button type="button" disabled={props.desksLoading} onClick={props.onRetryDesks}>{RETRY_DESKS_LABEL}</button>
      </div>}
      {props.voiceNotice && <div className="office-context-notice" role="status">
        <span>{props.voiceNotice}</span><button type="button" aria-label={DISMISS_MEDIA_NOTICE_LABEL} onClick={props.onDismissVoiceNotice}>{DISMISS_LABEL}</button>
      </div>}
      {props.deskAssignmentNotice && <div className="office-context-notice" role="status">
        <span>{props.deskAssignmentNotice}</span><button type="button" aria-label={DISMISS_DESK_NOTICE_LABEL} onClick={props.onDismissDeskAssignmentNotice}>{DISMISS_LABEL}</button>
      </div>}
      {props.children}
      {props.meetingAction}
    </div>
  </aside>;
}
