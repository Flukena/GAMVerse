import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import type { UserStatus } from "@gammyverse/shared";
import { USER_STATUS_PRESENTATIONS } from "../../presencePresentation";
import { AvailabilityMenu } from "./AvailabilityMenu";

export type AvailabilityControlProps = {
  status: UserStatus;
  disabled?: boolean;
  onStatusChange(status: UserStatus): Promise<boolean>;
  onEditCustomStatus(): void;
};

export function AvailabilityControl({ status, disabled, onStatusChange, onEditCustomStatus }: AvailabilityControlProps) {
  const menuId = useId();
  const controlRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const interactionEpochRef = useRef(0);
  const [open, setOpen] = useState(false);
  const presentation = USER_STATUS_PRESENTATIONS[status];
  const close = useCallback((restoreFocus = true) => {
    interactionEpochRef.current += 1;
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const withinControl = event.target instanceof Node && controlRef.current?.contains(event.target);
      const pendingBlur = disabled && event.target === document.body;
      if (event.key !== "Escape" || (!withinControl && !pendingBlur)) return;
      event.stopPropagation();
      event.preventDefault();
      close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, disabled, close]);
  const changeStatus = async (nextStatus: UserStatus) => {
    interactionEpochRef.current += 1;
    const epoch = interactionEpochRef.current;
    const saved = await onStatusChange(nextStatus);
    if (saved && epoch === interactionEpochRef.current) {
      const activeElement = document.activeElement;
      close(activeElement === document.body || (controlRef.current?.contains(activeElement) ?? false));
    }
  };
  const editCustomStatus = () => {
    close(false);
    onEditCustomStatus();
  };
  return <div ref={controlRef} className="user-status-dock-control">
    <button ref={triggerRef} type="button" className={`dock-button user-status-trigger${open ? " active" : ""}`}
      aria-label={`Your status: ${presentation.label}`} title={`Status · ${presentation.label}`}
      aria-expanded={open} aria-controls={menuId} onClick={() => {
        interactionEpochRef.current += 1;
        setOpen(previous => !previous);
      }}>
      <span className={`user-status-dot status-${status}`} style={{ "--status-color": presentation.color } as CSSProperties} aria-hidden="true">{presentation.icon}</span>
    </button>
    {open && <div id={menuId} className="user-status-menu"><AvailabilityMenu status={status} disabled={disabled}
      onStatusChange={next => { void changeStatus(next); }} onEditCustomStatus={editCustomStatus} /></div>}
  </div>;
}
