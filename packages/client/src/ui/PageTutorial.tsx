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

type TutorialStep = { title: string; body: string; target?: string; keyboard?: string; badge?: string };

const tutorials: Record<TutorialPage, { title: string; steps: TutorialStep[] }> = {
  "password-reset": { title: "Reset your password", steps: [
    { title: "New password", body: "Choose a password with at least 8 characters. The recovery link is single-use and expires after 15 minutes.", target: "reset-password" },
    { title: "Save password", body: "Save your new password, then return to sign in.", target: "reset-submit" },
  ] },
  lobby: { title: "Your workspace", steps: [
    { badge: "START HERE", title: "A home for your offices", body: "Your workspace brings offices, invitations, and maintainer tools together. Pick an office to meet your team, or create one for a new group." },
    { badge: "CREATE", title: "Set up a shared space", body: "Create an office for your team. New offices can start furnished or with empty rooms; you can update the map and props later.", target: "lobby-create-office" },
    { badge: "YOUR OFFICES", title: "Open and manage offices", body: "Search your office list and open a space. Owners and admins get role-based controls on the office card; maintainers also have platform tools.", target: "lobby-offices" },
    { badge: "INVITES", title: "Bring teammates in", body: "Review who invited you and the role offered, then accept to join. Office owners and admins can copy an invite link from inside their office.", target: "lobby-invitations" },
  ] },
  office: { title: "Inside the office", steps: [
    { badge: "WORKSPACE", title: "People, chat, and activity", body: "Use the left rail to find teammates, send office or direct messages, and catch up on recent activity. You can message people even when they are offline.", target: "office-navigation" },
    { badge: "ORIENTATION", title: "Read the minimap", body: "The compass rotates with your view. The minimap stays centered on you and marks teammates nearby; use it to keep your bearings while exploring.", target: "office-minimap" },
    { badge: "MOVE & LOOK", title: "Choose your view", body: "Walk with WASD or the on-screen controls. Press M to switch between 2D and 3D, V to change the 3D camera, and Space to jump in 3D.", keyboard: "WASD · M 2D/3D · V camera · Space jump" },
    { badge: "GET AROUND", title: "Click to travel", body: "Click an open place to travel there automatically; nearby trips may use a vehicle. In 2D, drag to pan and click to walk. Hold G to pass through prompted props; walls and locked rooms stay solid.", keyboard: "Click to travel · Drag to pan · Hold G" },
    { badge: "YOUR DESK", title: "Claim a private workroom", body: "Claim an available desk to make a private room yours. Use the character tools to return to your desk or recenter the camera when you need it.", target: "office-focus-character" },
    { badge: "TALK", title: "Meet people your way", body: "Walking into a voice conversation connects you automatically with your mic and camera off. Use Talk to listen, join, approach a conversation, or send a meet invitation.", target: "office-toolbar" },
    { badge: "MAKE IT YOURS", title: "Share and shape the space", body: "Members can place props and add notes, links, or supported embeds. Owners and admins can edit rooms, doors, roads, and the office spawn point." },
    { badge: "STATUS & PRIVACY", title: "Set boundaries when you need them", body: "Availability can quiet automatic media and interruptions while leaving movement available. Room owners can lock private spaces, admit guests, and revoke access." },
  ] },
  meeting: { title: "Join the meeting", steps: [
    { badge: "AUDIO", title: "You join muted", body: "Entering a voice zone does not turn on your microphone. Use the microphone control when you are ready to speak.", target: "office-microphone" },
    { badge: "SHARE", title: "Camera and screen", body: "Turn on your camera or share your screen when it helps the conversation. Camera-off participants remain visible in the meeting view.", target: "office-toolbar" },
    { badge: "MOVE", title: "Move around the room", body: "Walk with WASD. With heading lock on, hold A or D to turn; press Space to jump in 3D. M switches between the 2D and 3D views.", keyboard: "WASD · Hold A / D to turn · Space jump" },
  ] },
};

function storageKey(page: TutorialPage, username?: string) {
  const userScope = username?.trim().toLowerCase() || "visitor";
  return `gammyverse.tutorial.seen.v2.${userScope}.${page}`;
}

function legacyStorageKey(page: TutorialPage, username?: string) {
  const userScope = username?.trim().toLowerCase() || "visitor";
  return `gammyverse.tutorial.dismissed.v1.${userScope}.${page}`;
}

function tutorialWasSeen(key: string, page: TutorialPage, username?: string) {
  try {
    return window.localStorage.getItem(key) === "1" || window.localStorage.getItem(legacyStorageKey(page, username)) === "1";
  } catch {
    return false;
  }
}

export function PageTutorial({ page, username }: { page: TutorialPage; username?: string }) {
  const cardRef = useRef<HTMLElement>(null);
  const reopenRef = useRef<HTMLButtonElement>(null);
  const key = storageKey(page, username);
  const [open, setOpen] = useState(() => !tutorialWasSeen(key, page, username));
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
    setOpen(!tutorialWasSeen(key, page, username));
    setStepIndex(0);
  }, [key, page, username]);

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
    try { window.localStorage.setItem(key, "1"); } catch { /* The guide stays closed for this view if storage is unavailable. */ }
    setOpen(false);
  };
  const next = () => {
    if (stepIndex + 1 < content.steps.length) setStepIndex((index) => index + 1);
    else close();
  };
  const goBack = () => setStepIndex((index) => Math.max(0, index - 1));
  const tooltipWidth = Math.min(390, window.innerWidth - 32);
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
    {!open && <button ref={reopenRef} type="button" className="page-tutorial-reopen" aria-label="Show page guide" title="Show page guide" onClick={() => { setStepIndex(0); setOpen(true); }}>?</button>}
    {open && <div className="page-tutorial-layer" role="presentation">
      {step.target && targetRect ? <div className="page-tutorial-spotlight" aria-hidden="true" style={{ left: targetRect.left - 8, top: targetRect.top - 8, width: targetRect.width + 16, height: targetRect.height + 16 }} /> : <div className="page-tutorial-dim" aria-hidden="true" />}
      <section ref={cardRef} onKeyDown={event => handleTutorialKeyDown(event, close)} className={`page-tutorial-card${step.target && targetRect ? " is-focus" : " is-popup"}`} style={step.target && targetRect ? { left: tooltipLeft, top: tooltipTop } : undefined} role="dialog" aria-modal="true" aria-labelledby="page-tutorial-title" aria-describedby="page-tutorial-body">
        <button type="button" className="page-tutorial-close" aria-label="Close guide" onClick={close}>×</button>
        <div className="page-tutorial-heading"><span className="page-tutorial-eyebrow">{content.title}</span><span className="page-tutorial-count">{stepIndex + 1} / {content.steps.length}</span></div>
        <div className="page-tutorial-progress" role="progressbar" aria-label="Guide progress" aria-valuemin={1} aria-valuemax={content.steps.length} aria-valuenow={stepIndex + 1}><span style={{ width: `${((stepIndex + 1) / content.steps.length) * 100}%` }} /></div>
        {step.badge && <span className="page-tutorial-badge">{step.badge}</span>}
        <h2 id="page-tutorial-title">{step.title}</h2>
        <p id="page-tutorial-body">{step.body}</p>
        {step.keyboard && <kbd className="page-tutorial-keys">{step.keyboard}</kbd>}
        <div className="page-tutorial-actions">
          <span className="page-tutorial-hint">Press Esc to close</span>
          <div className="page-tutorial-nav">
            {stepIndex > 0 && <button type="button" className="page-tutorial-back" onClick={goBack}>Back</button>}
            <button type="button" className="page-tutorial-done" onClick={next}>{stepIndex + 1 < content.steps.length ? "Next" : "Finish"}</button>
          </div>
        </div>
      </section>
    </div>}
  </>;
}
