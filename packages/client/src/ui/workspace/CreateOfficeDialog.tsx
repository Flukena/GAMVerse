import { useId, useRef, type FormEvent } from "react";
import type { CampusInteriorPreset } from "@gammyverse/shared";
import { WorkspaceDialog } from "./WorkspaceDialog";
import "./CreateOfficeDialog.css";

const OFFICE_NAME_MIN_CHARACTERS = 2;
const OFFICE_NAME_MAX_CHARACTERS = 64;
const PEOPLE_MIN_COUNT = 1;
const PEOPLE_MAX_COUNT = 4_000;
const TEAMS_MIN_COUNT = 1;
const TEAMS_MAX_COUNT = 250;
const WHOLE_NUMBER_STEP_COUNT = 1;
const CREATE_LABEL = "Create office";
const CLOSE_LABEL = "Close create office";
const NAME_LABEL = "Office name";
const PEOPLE_LABEL = "Total people";
const TEAMS_LABEL = "Teams";
const INTERIORS_LABEL = "New office interiors";
const FURNISHED_LABEL = "Furnished starter (recommended)";
const EMPTY_LABEL = "Empty interiors";
const FURNISHED_HINT = "Add starter desks, seating and shared furniture to this new office.";
const EMPTY_HINT = "Create the rooms and layout without starter furniture.";
const DESCRIPTION_LABEL = "Set a name and team size. We’ll generate a campus map to fit.";
const INVALID_COUNTS_LABEL = "Total people must divide evenly across teams, with 1–16 people per team.";
const CANCEL_LABEL = "Cancel";
const SUBMIT_LABEL = "Create office & map";
const CREATING_LABEL = "Creating…";
export interface CreateOfficeDialogProps {
  name: string; totalPeople: number; teamCount: number; peoplePerTeam: number; inputsValid: boolean;
  interiors: CampusInteriorPreset; busy: boolean; error: string | null;
  onNameChange(value: string): void; onTotalPeopleChange(value: number): void; onTeamCountChange(value: number): void;
  onInteriorsChange(value: CampusInteriorPreset): void; onSubmit(event: FormEvent<HTMLFormElement>): void; onClose(): void;
}
export function CreateOfficeDialog(props: CreateOfficeDialogProps) {
  const id = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const close = () => { if (!props.busy) props.onClose(); };
  return <WorkspaceDialog labelledBy={`${id}-title`} onClose={close} initialFocusRef={nameRef} className="office-creation-dialog">
    <form onSubmit={props.onSubmit} aria-busy={props.busy}>
      <header><h2 id={`${id}-title`}>{CREATE_LABEL}</h2><button type="button" disabled={props.busy} aria-label={CLOSE_LABEL} onClick={close}>×</button></header>
      <div className="office-creation-body"><p>{DESCRIPTION_LABEL}</p>
        <fieldset disabled={props.busy}>
          <label htmlFor={`${id}-name`}>{NAME_LABEL}</label><input ref={nameRef} id={`${id}-name`} required minLength={OFFICE_NAME_MIN_CHARACTERS} maxLength={OFFICE_NAME_MAX_CHARACTERS} value={props.name} onChange={event => props.onNameChange(event.target.value)} />
          <div className="office-creation-counts"><label htmlFor={`${id}-people`}>{PEOPLE_LABEL}<input id={`${id}-people`} type="number" min={PEOPLE_MIN_COUNT} max={PEOPLE_MAX_COUNT} step={WHOLE_NUMBER_STEP_COUNT} value={props.totalPeople} onChange={event => props.onTotalPeopleChange(Number(event.target.value))} /></label>
            <label htmlFor={`${id}-teams`}>{TEAMS_LABEL}<input id={`${id}-teams`} type="number" min={TEAMS_MIN_COUNT} max={TEAMS_MAX_COUNT} step={WHOLE_NUMBER_STEP_COUNT} value={props.teamCount} onChange={event => props.onTeamCountChange(Number(event.target.value))} /></label></div>
          {props.inputsValid ? <p>{props.peoplePerTeam} people per team · {props.totalPeople} ÷ {props.teamCount}</p> : <p role="alert">{INVALID_COUNTS_LABEL}</p>}
        </fieldset>
        <fieldset disabled={props.busy} className="office-creation-interiors"><legend>{INTERIORS_LABEL}</legend>
          <label><input type="radio" name={`${id}-interiors`} value="furnished" checked={props.interiors === "furnished"} onChange={() => props.onInteriorsChange("furnished")} /><span><strong>{FURNISHED_LABEL}</strong><small>{FURNISHED_HINT}</small></span></label>
          <label><input type="radio" name={`${id}-interiors`} value="empty" checked={props.interiors === "empty"} onChange={() => props.onInteriorsChange("empty")} /><span><strong>{EMPTY_LABEL}</strong><small>{EMPTY_HINT}</small></span></label>
        </fieldset>
        {props.error && <p role="alert">{props.error}</p>}
      </div>
      <footer><button type="button" disabled={props.busy} onClick={close}>{CANCEL_LABEL}</button><button type="submit" disabled={props.busy || !props.inputsValid}>{props.busy ? CREATING_LABEL : SUBMIT_LABEL}</button></footer>
    </form>
  </WorkspaceDialog>;
}
