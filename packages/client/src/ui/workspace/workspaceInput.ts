const WORKSPACE_MODAL_SELECTOR = 'dialog[open], [role="dialog"][aria-modal="true"]';
const WORKSPACE_TYPING_SELECTOR = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]';

interface WorkspaceInputScope {
  querySelector(selector: string): unknown;
}

export function isWorkspaceInputBlocked(target: EventTarget | null, scope: WorkspaceInputScope = document): boolean {
  if (scope.querySelector(WORKSPACE_MODAL_SELECTOR)) return true;
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
  return target.isContentEditable || Boolean(target.closest(`${WORKSPACE_MODAL_SELECTOR}, ${WORKSPACE_TYPING_SELECTOR}`));
}
