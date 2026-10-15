import { useId, type ReactNode } from "react";
import { WorkspaceDialog } from "../workspace/WorkspaceDialog";
import { ConversationCues, type ConversationCuesProps } from "./ConversationCues";
import "./Conversations.css";

const CONVERSATIONS_LABEL = "Conversations";
const CLOSE_LABEL = "Close conversations";
export type PublicConversationDialogProps = ConversationCuesProps & { controls?: ReactNode; onClose(): void };
export function PublicConversationDialog({ controls, onClose, ...cues }: PublicConversationDialogProps) {
  const headingId = useId();
  return <WorkspaceDialog labelledBy={headingId} onClose={onClose} className="public-conversation-dialog">
    <header className="public-conversation-header"><h2 id={headingId}>{CONVERSATIONS_LABEL}</h2>
      <button type="button" aria-label={CLOSE_LABEL} title={CLOSE_LABEL} onClick={onClose}>×</button></header>
    <div className="public-conversation-body">
      {controls}
      <ConversationCues {...cues} />
    </div>
  </WorkspaceDialog>;
}
