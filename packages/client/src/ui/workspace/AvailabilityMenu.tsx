import type { UserStatus } from "@gammyverse/shared";
import { AvailabilityStatusPicker } from "./AvailabilityStatusPicker";
import "./Availability.css";

const CUSTOM_STATUS_LABEL = "Set custom status";
export type AvailabilityMenuProps = {
  status: UserStatus;
  disabled?: boolean;
  onStatusChange(status: UserStatus): void;
  onEditCustomStatus(): void;
};

export function AvailabilityMenu({ status, disabled, onStatusChange, onEditCustomStatus }: AvailabilityMenuProps) {
  return <div className="availability-menu">
    <AvailabilityStatusPicker status={status} disabled={disabled} onChange={onStatusChange} />
    <button type="button" disabled={disabled} onClick={onEditCustomStatus}>{CUSTOM_STATUS_LABEL}</button>
  </div>;
}
