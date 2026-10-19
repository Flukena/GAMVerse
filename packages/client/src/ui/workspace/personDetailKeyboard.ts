type PersonDetailKeyEvent = {
  key: string; defaultPrevented: boolean; preventDefault(): void; stopPropagation(): void;
};

/** Consume only this panel's dismissal; movement keyup must always reach the world. */
export function handlePersonDetailEscape(event: PersonDetailKeyEvent, modalOpen: boolean, close: () => void): boolean {
  if (event.key !== "Escape" || event.defaultPrevented || modalOpen) return false;
  event.preventDefault();
  event.stopPropagation();
  close();
  return true;
}
