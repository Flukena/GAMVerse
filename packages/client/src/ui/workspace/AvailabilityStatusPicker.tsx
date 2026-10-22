import { useId, type CSSProperties } from "react";
import type { UserStatus } from "@gammyverse/shared";
import { AVAILABILITY_OPTIONS } from "./AvailabilityPresentation";

const AVAILABILITY_LABEL = "Availability";

export type AvailabilityStatusPickerProps = {
  status: UserStatus;
  disabled?: boolean;
  onChange(status: UserStatus): void;
};

export function AvailabilityStatusPicker({ status, disabled, onChange }: AvailabilityStatusPickerProps) {
  const groupName = useId();
  return <fieldset className="availability-status-picker" disabled={disabled}>
    <legend>{AVAILABILITY_LABEL}</legend>
    <div className="availability-status-options">{AVAILABILITY_OPTIONS.map(option =>
      <label key={option.value} className="availability-status-option" style={{ "--availability-status-color": option.color } as CSSProperties}>
        <input type="radio" name={groupName} value={option.value} checked={status === option.value} onChange={() => onChange(option.value)} />
        <span className="availability-status-symbol" aria-hidden="true">{option.icon}</span>
        <span className="availability-status-label">{option.label}</span>
        <span className="availability-status-selected" aria-hidden="true">✓</span>
      </label>
    )}</div>
  </fieldset>;
}
