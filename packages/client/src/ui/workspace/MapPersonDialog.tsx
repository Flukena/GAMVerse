import { useId } from "react";
import { PersonCard, type PersonCardProps } from "./PersonCard";
import { WorkspaceDialog } from "./WorkspaceDialog";
import type { PersonActionCallbacks } from "./personActions";

type MapPersonDialogProps = PersonCardProps & { onClose(): void };

export function MapPersonDialog(props: MapPersonDialogProps) {
  const titleId = useId();
  const complete = (action: (target: string) => void, target: string) => { props.onClose(); action(target); };
  const callbacks: PersonActionCallbacks = {
    onMessage: target => complete(props.onMessage, target),
    onGoTo: target => complete(props.onGoTo, target),
    onLocate: target => complete(props.onLocate, target),
    onFollow: target => complete(props.onFollow, target),
    onWave: target => complete(props.onWave, target),
    onSpotlight: target => complete(props.onSpotlight, target),
  };
  return <WorkspaceDialog labelledBy={titleId} onClose={props.onClose}>
    <header className="command-palette-header"><h2 id={titleId}>Person details</h2>
      <button type="button" aria-label="Close person details" onClick={props.onClose}>×</button></header>
    <PersonCard {...props} {...callbacks} />
  </WorkspaceDialog>;
}
