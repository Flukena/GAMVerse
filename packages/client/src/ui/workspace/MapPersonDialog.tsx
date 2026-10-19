import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { PersonCard, type PersonCardProps } from "./PersonCard";
import type { PersonActionCallbacks } from "./personActions";
import { handlePersonDetailEscape } from "./personDetailKeyboard";
import { isWorkspaceInputBlocked } from "./workspaceInput";
import "./MapPersonDialog.css";

const TITLE_LABEL = "Person details";
const CLOSE_LABEL = "Close person details";
const MOVEMENT_HINT_LABEL = "Keep exploring while this profile is open.";
type MapPersonDialogProps = PersonCardProps & { onClose(): void };

/** Nonmodal profile: opening it never steals world focus or suspends movement. */
export function MapPersonDialog(props: MapPersonDialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef(props.onClose);
  closeRef.current = props.onClose;
  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => handlePersonDetailEscape(event, isWorkspaceInputBlocked(null), () => closeRef.current());
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, []);
  useLayoutEffect(() => {
    const trigger = document.activeElement;
    const panel = panelRef.current;
    return () => {
      if (panel?.contains(document.activeElement) && trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);
  const complete = (action: ((target: string) => void) | undefined, target: string) => {
    if (!action) return;
    props.onClose(); action(target);
  };
  const callbacks: PersonActionCallbacks = {
    onMessage: target => complete(props.onMessage, target),
    onGoTo: target => complete(props.onGoTo, target),
    onLocate: target => complete(props.onLocate, target),
    onFollow: target => complete(props.onFollow, target),
    onWave: target => complete(props.onWave, target),
    onSpotlight: target => complete(props.onSpotlight, target),
    onMeet: target => complete(props.onMeet, target),
    onInviteToJoin: target => complete(props.onInviteToJoin, target),
  };
  return <aside ref={panelRef} className="person-detail-panel" aria-labelledby={titleId}>
    <header className="person-detail-panel-heading"><h2 id={titleId}>{TITLE_LABEL}</h2>
      <button type="button" className="person-detail-close" aria-label={CLOSE_LABEL} onClick={props.onClose}>×</button></header>
    <PersonCard {...props} {...callbacks} presentation="profile" />
    <footer className="person-detail-panel-hint">{MOVEMENT_HINT_LABEL}</footer>
  </aside>;
}
