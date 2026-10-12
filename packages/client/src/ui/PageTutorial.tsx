import { useEffect, useLayoutEffect, useState } from "react";
import "./PageTutorial.css";

export type TutorialPage = "password-reset" | "lobby" | "office" | "meeting";

type TutorialStep = { title: string; body: string; target?: string; keyboard?: string };

const tutorials: Record<TutorialPage, { title: string; steps: TutorialStep[] }> = {
  "password-reset": { title: "Reset your password", steps: [
    { title: "New password", body: "Choose a password with at least 8 characters. The recovery link is single-use and expires after 15 minutes.", target: "reset-password" },
    { title: "Save password", body: "Save your new password, then return to sign in.", target: "reset-submit" },
  ] },
  lobby: { title: "Your workspace", steps: [
    { title: "Create an office", body: "Create a new office and generate its map. You can also enter an office listed below.", target: "lobby-create-office" },
    { title: "Your offices", body: "Open an office you belong to from this list.", target: "lobby-offices" },
    { title: "Invitations", body: "Check invitations here when a teammate invites you.", target: "lobby-invitations" },
    { title: "Move around", body: "Use your keyboard to walk around once you enter an office.", keyboard: "W A S D  ·  Arrow keys" },
  ] },
  office: { title: "Inside the office", steps: [
    { title: "Focus your character", body: "Center the map on your character. Use the adjacent arrow button to travel to your desk when available.", target: "office-focus-character" },
    { title: "Office toolbar", body: "These controls manage microphone, camera, screen sharing, audio, status, and leaving the office.", target: "office-toolbar" },
    { title: "Move around", body: "Walk with your keyboard. Hold Shift to move faster. Double-click the map to automate travel.", keyboard: "W A S D  ·  Arrow keys  ·  Shift" },
  ] },
  meeting: { title: "Join the meeting", steps: [
    { title: "Microphone", body: "Speak with people in this room. Your microphone connects when you enter a voice zone.", target: "office-microphone" },
    { title: "Camera and screen", body: "Turn on your camera or share your screen from these controls.", target: "office-toolbar" },
    { title: "Move around", body: "Walk around the meeting room with your keyboard.", keyboard: "W A S D  ·  Arrow keys" },
  ] },
};

function storageKey(page: TutorialPage, username?: string) {
  const userScope = username?.trim().toLowerCase() || "visitor";
  return `gammyverse.tutorial.dismissed.v1.${userScope}.${page}`;
}

export function PageTutorial({ page, username }: { page: TutorialPage; username?: string }) {
  const key = storageKey(page, username);
  const [open, setOpen] = useState(() => {
    try { return window.localStorage.getItem(key) !== "1"; } catch { return true; }
  });
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const content = tutorials[page];
  const step = content.steps[stepIndex];

  useEffect(() => {
    try { setOpen(window.localStorage.getItem(key) !== "1"); } catch { setOpen(true); }
    setDontShowAgain(false);
    setStepIndex(0);
  }, [key]);

  useLayoutEffect(() => {
    setTargetRect(null);
    if (!open || !step.target) return;
    const target = document.querySelector<HTMLElement>(`[data-tutorial-target="${step.target}"]`);
    if (!target) return;
    target.classList.add("page-tutorial-focused-target");
    target.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center", inline: "center" });
    let frame = 0;
    let settleFrame = 0;
    const updateRect = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const current = target.getBoundingClientRect();
        setTargetRect(new DOMRect(current.x, current.y, current.width, current.height));
      });
    };
    updateRect();
    const timer = window.setTimeout(updateRect, 260);
    const observer = new ResizeObserver(updateRect);
    observer.observe(target);
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    settleFrame = requestAnimationFrame(() => requestAnimationFrame(updateRect));
    return () => {
      target.classList.remove("page-tutorial-focused-target");
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
      cancelAnimationFrame(settleFrame);
      observer.disconnect();
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [open, step.target, stepIndex]);

  const close = () => {
    if (dontShowAgain) {
      try { window.localStorage.setItem(key, "1"); } catch { /* Preference remains active for this tab if storage is unavailable. */ }
    }
    setOpen(false);
  };
  const next = () => {
    if (stepIndex + 1 < content.steps.length) setStepIndex((index) => index + 1);
    else close();
  };
  const goBack = () => setStepIndex((index) => Math.max(0, index - 1));
  const tooltipWidth = Math.min(340, window.innerWidth - 32);
  const tooltipLeft = targetRect
    ? Math.max(16, Math.min(window.innerWidth - tooltipWidth - 16, targetRect.left + targetRect.width / 2 - tooltipWidth / 2))
    : Math.max(16, (window.innerWidth - tooltipWidth) / 2);
  const tooltipTop = targetRect
    ? targetRect.bottom + 18 + 190 < window.innerHeight ? targetRect.bottom + 18 : Math.max(16, targetRect.top - 208)
    : Math.max(16, (window.innerHeight - 300) / 2);

  return <>
    {!open && <button type="button" className="page-tutorial-reopen" aria-label="Show page guide" title="Show page guide" onClick={() => { setDontShowAgain(false); setStepIndex(0); setOpen(true); }}>?</button>}
    {open && <div className="page-tutorial-layer" role="presentation">
      {step.target && targetRect ? <div className="page-tutorial-spotlight" aria-hidden="true" style={{ left: targetRect.left - 8, top: targetRect.top - 8, width: targetRect.width + 16, height: targetRect.height + 16 }} /> : <div className="page-tutorial-dim" aria-hidden="true" />}
      <section className={`page-tutorial-card${step.target && targetRect ? " is-focus" : " is-popup"}`} style={step.target && targetRect ? { left: tooltipLeft, top: tooltipTop } : undefined} role="dialog" aria-modal="true" aria-labelledby="page-tutorial-title" aria-describedby="page-tutorial-body">
        <button type="button" className="page-tutorial-close" aria-label="Close guide" onClick={close}>×</button>
        <span className="page-tutorial-eyebrow">{step.keyboard ? "KEYBOARD GUIDE" : "QUICK GUIDE"} · {stepIndex + 1}/{content.steps.length}</span>
        <h2 id="page-tutorial-title">{step.title}</h2>
        <p id="page-tutorial-body">{step.body}</p>
        {step.keyboard && <kbd className="page-tutorial-keys">{step.keyboard}</kbd>}
        <div className="page-tutorial-actions">
          <label className="page-tutorial-optout"><input type="checkbox" checked={dontShowAgain} onChange={(event) => setDontShowAgain(event.target.checked)} /> Don’t show again</label>
          <div className="page-tutorial-nav">
            {stepIndex > 0 && <button type="button" className="page-tutorial-back" onClick={goBack}>Back</button>}
            <button type="button" className="page-tutorial-done" onClick={next}>{stepIndex + 1 < content.steps.length ? "Next" : "Finish"}</button>
          </div>
        </div>
      </section>
    </div>}
  </>;
}
