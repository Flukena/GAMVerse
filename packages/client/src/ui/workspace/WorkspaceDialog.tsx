import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import "./WorkspaceShell.css";

interface WorkspaceDialogProps {
  labelledBy: string;
  onClose(): void;
  children: ReactNode;
  className?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
}

export function WorkspaceDialog({ labelledBy, onClose, children, className = "", initialFocusRef }: WorkspaceDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const trigger = document.activeElement;
    dialog.showModal();
    initialFocusRef?.current?.focus();
    return () => {
      dialog.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, [initialFocusRef]);
  return <dialog ref={ref} className={`workspace-dialog ${className}`} aria-labelledby={labelledBy} aria-modal="true"
    onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onClose(); }}
    onKeyDown={(event) => event.stopPropagation()} onKeyUp={(event) => event.stopPropagation()}>
    {children}
  </dialog>;
}
