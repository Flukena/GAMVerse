import { useId } from "react";
import type { UserStatus } from "@gammyverse/shared";
import { AVAILABILITY_OPTIONS } from "./AvailabilityPresentation";
import "./Availability.css";

const AVAILABILITY_LABEL = "Availability";
const CUSTOM_STATUS_LABEL = "Set custom status";
export type AvailabilityMenuProps = {
  status: UserStatus;
  disabled?: boolean;
  onStatusChange(status: UserStatus): void;
  onEditCustomStatus(): void;
};

export function AvailabilityMenu({ status, disabled, onStatusChange, onEditCustomStatus }: AvailabilityMenuProps) {
  const id = useId();
  return <div className="availability-menu">
    <label htmlFor={id}>{AVAILABILITY_LABEL}</label>
    <select id={id} value={status} disabled={disabled} onChange={(event) => {
      const selected = AVAILABILITY_OPTIONS.find((option) => option.value === event.target.value);
      if (selected) onStatusChange(selected.value);
    }}>{AVAILABILITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.icon} {option.label}</option>)}</select>
    <button type="button" disabled={disabled} onClick={onEditCustomStatus}>{CUSTOM_STATUS_LABEL}</button>
  </div>;
}
