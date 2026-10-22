import type { MutableRefObject, PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from "react";

const TOUCH_ACTIVATION_KEY_CODES = new Set(["Enter", "Space"]);

export function TouchMoveButton({
  label,
  code,
  heldKeysRef,
  onInputChange,
  disabled = false,
  children,
}: {
  label: string;
  code: string;
  heldKeysRef: MutableRefObject<Set<string>>;
  onInputChange?: () => void;
  disabled?: boolean;
  children: string;
}) {
  const hold = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.preventDefault();
    heldKeysRef.current.add(code);
    onInputChange?.();
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const release = (event?: ReactPointerEvent<HTMLButtonElement> | ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event && "preventDefault" in event) event.preventDefault();
    heldKeysRef.current.delete(code);
    onInputChange?.();
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (TOUCH_ACTIVATION_KEY_CODES.has(event.code)) {
      event.preventDefault();
      heldKeysRef.current.add(code);
      if (!event.repeat) onInputChange?.();
    }
  };
  const onKeyUp = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (TOUCH_ACTIVATION_KEY_CODES.has(event.code)) release(event);
  };

  return (
    <button
      type="button"
      className="touch-move-button"
      aria-label={label}
      disabled={disabled}
      onPointerDown={hold}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={() => release()}
    >
      {children}
    </button>
  );
}
