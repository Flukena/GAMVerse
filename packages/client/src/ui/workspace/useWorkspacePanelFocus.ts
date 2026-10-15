import { useEffect, type KeyboardEvent } from "react";
import type { OfficePanel } from "./OfficeNavigation";

const WORKSPACE_PANEL_ID = "office-sidebar";
const WORKSPACE_PANEL_FOCUS_SELECTORS = ["[data-workspace-panel-focus]", "input:not(:disabled), textarea:not(:disabled), select:not(:disabled)", ".office-panel-header button"];

type PanelEscapeEvent = Pick<KeyboardEvent, "key" | "defaultPrevented" | "preventDefault" | "stopPropagation">;
interface WorkspacePanelFocusOptions {
  open: boolean;
  panel: OfficePanel;
  close(): void;
}

export function handleWorkspacePanelEscape(event: PanelEscapeEvent, close: () => void, restoreFocus: () => void): void {
  if (event.key !== "Escape" || event.defaultPrevented) return;
  event.preventDefault();
  event.stopPropagation();
  close();
  restoreFocus();
}

function focusWorkspacePanel(): void {
  const sidebar = document.getElementById(WORKSPACE_PANEL_ID);
  if (!sidebar || sidebar.inert) return;
  for (const selector of WORKSPACE_PANEL_FOCUS_SELECTORS) {
    const target = sidebar.querySelector<HTMLElement>(selector);
    if (target) { target.focus(); return; }
  }
}

export function useWorkspacePanelFocus({ open, panel, close }: WorkspacePanelFocusOptions) {
  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(focusWorkspacePanel);
    return () => window.cancelAnimationFrame(frame);
  }, [open, panel]);
  return (event: KeyboardEvent<HTMLElement>) => {
    if (!open) return;
    handleWorkspacePanelEscape(event, close, () => document.getElementById(`office-nav-${panel}`)?.focus());
  };
}
