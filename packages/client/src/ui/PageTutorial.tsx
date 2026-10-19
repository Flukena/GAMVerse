import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import "./PageTutorial.css";

const TUTORIAL_FOCUSABLE_SELECTOR = "button:not(:disabled), input:not(:disabled)";

function handleTutorialKeyDown(event: KeyboardEvent<HTMLElement>, close: () => void) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    close();
    return;
  }
  if (event.key !== "Tab") return;
  const controls = event.currentTarget.querySelectorAll<HTMLElement>(TUTORIAL_FOCUSABLE_SELECTOR);
  const first = controls.item(0);
  const last = controls.item(controls.length - 1);
  const boundary = event.shiftKey ? first : last;
  if (document.activeElement !== boundary) return;
  event.preventDefault();
  (event.shiftKey ? last : first)?.focus();
}

export type TutorialPage = "password-reset" | "lobby" | "office" | "meeting";

type TutorialStep = { title: string; body: string; target?: string; keyboard?: string };

const tutorials: Record<TutorialPage, { title: string; steps: TutorialStep[] }> = {
  "password-reset": { title: "Reset your password", steps: [
    { title: "New password", body: "Choose a password with at least 8 characters. The recovery link is single-use and expires after 15 minutes.", target: "reset-password" },
    { title: "Save password", body: "Save your new password, then return to sign in.", target: "reset-submit" },
  ] },
  lobby: { title: "Your workspace", steps: [
    { title: "Welcome to your workspace", body: "Your lobby brings your offices, invitations, and (for maintainers) account tools together. Use the sections below to switch between them." },
    { title: "Create an office", body: "Start a new shared space here. To manage an existing office, use its card in Your offices.", target: "lobby-create-office" },
    { title: "Your offices", body: "Search the list, open an office you belong to, or move between pages when the list is long. Office management actions appear on cards when your role allows them.", target: "lobby-offices" },
    { title: "Invitations", body: "Find pending invites, review who invited you and the role offered, then accept to add the office to Your offices. Search and pagination are available here too.", target: "lobby-invitations" },
  ] },
  office: { title: "Inside the office", steps: [
    { title: "Find people and conversations", body: "Use the left rail to open People, Chat, and Activity. Select a teammate to view their profile and available ways to connect.", target: "office-navigation" },
    { title: "Keep your bearings", body: "The compass and minimap stay centered on you and show nearby teammates. They rotate with your view; the map itself is not an interactive control.", target: "office-minimap" },
    { title: "Character tools", body: "Open this group to recenter the view or change camera follow. Go to your desk appears only when you have a desk and are not already there; it teleports you to it.", target: "office-focus-character" },
    { title: "Click to travel, drag to look", body: "Click an open spot on the ground to start automatic travel. Up to 200 blocks it uses a vehicle; farther away it teleports. Locked rooms cannot be entered. Drag the map to pan the view; a drag does not trigger travel.", keyboard: "Click ground · Drag to pan" },
    { title: "Office controls", body: "Use the bottom toolbar for microphone, camera, screen sharing, audio, status, and leaving the office. Voice connects when you enter a voice zone.", target: "office-toolbar" },
  ] },
  meeting: { title: "Join the meeting", steps: [
    { title: "Microphone", body: "Speak with people in this room. Your microphone connects when you enter a voice zone.", target: "office-microphone" },
    { title: "Camera and screen", body: "Turn on your camera or share your screen from these controls.", target: "office-toolbar" },
    { title: "Move around", body: "When camera lock is on, W/S walk and holding A/D turns in 15° steps. Use the lock button to release or restore the angle; press Space to jump in 3D.", keyboard: "W / S  ·  Hold A / D  ·  Space" },
  ] },
};

function storageKey(page: TutorialPage, username?: string) {
  const userScope = username?.trim().toLowerCase() || "visitor";
  return `gammyverse.tutorial.dismissed.v1.${userScope}.${page}`;
}

export function PageTutorial({ page, username }: { page: TutorialPage; username?: string }) {
  const cardRef = useRef<HTMLElement>(null);
  const reopenRef = useRef<HTMLButtonElement>(null);
  const key = storageKey(page, username);
  const [open, setOpen] = useState(() => {
    try { return window.localStorage.getItem(key) !== "1"; } catch { return true; }
  });
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [cardHeight, setCardHeight] = useState(0);
  const content = tutorials[page];
  const step = content.steps[stepIndex];

  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement;
    cardRef.current?.querySelector<HTMLElement>(TUTORIAL_FOCUSABLE_SELECTOR)?.focus();
    return () => {
      if (trigger instanceof HTMLElement && trigger !== document.body && trigger.isConnected) trigger.focus();
      else reopenRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    try { setOpen(window.localStorage.getItem(key) !== "1"); } catch { setOpen(true); }
    setDontShowAgain(false);
    setStepIndex(0);
  }, [key]);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!open || !card) return;
    const updateHeight = () => setCardHeight(card.getBoundingClientRect().height);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(card);
    window.addEventListener("resize", updateHeight);
    return () => { observer.disconnect(); window.removeEventListener("resize", updateHeight); };
  }, [open, stepIndex]);

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
    ? targetRect.bottom + 18 + Math.max(cardHeight, 190) < window.innerHeight
      ? targetRect.bottom + 18
      : targetRect.top - Math.max(cardHeight, 190) - 18 >= 16
        ? targetRect.top - Math.max(cardHeight, 190) - 18
        : Math.max(16, Math.min(window.innerHeight - Math.max(cardHeight, 190) - 16, targetRect.top + targetRect.height / 2 - Math.max(cardHeight, 190) / 2))
    : Math.max(16, (window.innerHeight - 300) / 2);

  return <>
    {!open && <button ref={reopenRef} type="button" className="page-tutorial-reopen" aria-label="Show page guide" title="Show page guide" onClick={() => { setDontShowAgain(false); setStepIndex(0); setOpen(true); }}>?</button>}
    {open && <div className="page-tutorial-layer" role="presentation">
      {step.target && targetRect ? <div className="page-tutorial-spotlight" aria-hidden="true" style={{ left: targetRect.left - 8, top: targetRect.top - 8, width: targetRect.width + 16, height: targetRect.height + 16 }} /> : <div className="page-tutorial-dim" aria-hidden="true" />}
      <section ref={cardRef} onKeyDown={event => handleTutorialKeyDown(event, close)} className={`page-tutorial-card${step.target && targetRect ? " is-focus" : " is-popup"}`} style={step.target && targetRect ? { left: tooltipLeft, top: tooltipTop } : undefined} role="dialog" aria-modal="true" aria-labelledby="page-tutorial-title" aria-describedby="page-tutorial-body">
        <button type="button" className="page-tutorial-close" aria-label="Close guide" onClick={close}>×</button>
        <span className="page-tutorial-eyebrow">{page === "lobby" ? "LOBBY GUIDE" : "OFFICE GUIDE"} · STEP {stepIndex + 1} OF {content.steps.length}</span>
        <div className="page-tutorial-progress" role="progressbar" aria-label="Guide progress" aria-valuemin={1} aria-valuemax={content.steps.length} aria-valuenow={stepIndex + 1}><span style={{ width: `${((stepIndex + 1) / content.steps.length) * 100}%` }} /></div>
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
