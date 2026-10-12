import { useEffect, useRef } from "react";

type FullScreenLoadingProps = {
  label?: string;
};

/** Blocks interaction while a screen's required request is in progress. */
export function FullScreenLoading({ label = "Loading" }: FullScreenLoadingProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    overlayRef.current?.focus();
    return () => previousFocus?.focus();
  }, []);

  return (
    <div ref={overlayRef} className="full-screen-loading" role="status" aria-live="polite" aria-label={label} tabIndex={-1} onKeyDownCapture={(event) => { event.preventDefault(); event.stopPropagation(); }}>
      <div className="full-screen-loading-mark" aria-hidden="true">
        <span className="full-screen-loading-ring" />
        <span className="full-screen-loading-logo">G</span>
      </div>
      <span className="full-screen-loading-label">{label}</span>
    </div>
  );
}
