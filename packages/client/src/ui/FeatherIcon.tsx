const FEATHER_ICON_SIZE_PX = 18;
const FEATHER_ICON_STROKE_WIDTH_PX = 1.8;

export function FeatherIcon({ name, size = FEATHER_ICON_SIZE_PX }: { name: "mic" | "micOff" | "video" | "videoOff" | "screen" | "screenOff" | "headphones" | "headphonesOff" | "close" | "maximize" | "exit" | "car" | "lock" | "unlock" | "refresh" | "office" | "chat" | "people" | "clock"; size?: number }) {
  const shared = { fill: "none", stroke: "currentColor", strokeWidth: FEATHER_ICON_STROKE_WIDTH_PX, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const drawings = {
    mic: <><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></>,
    micOff: <><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9V5a3 3 0 0 0-5.83-1M5 10v2a7 7 0 0 0 11.4 5.45M19 10v2c0 .6-.08 1.17-.22 1.71M12 19v3m-4 0h8M2 2l20 20"/></>,
    video: <><rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3z"/></>,
    videoOff: <><path d="m3 3 18 18M10.6 5H14a2 2 0 0 1 2 2v2l5-3v10l-5-3v2a2 2 0 0 1-.59 1.41M3 7v10a2 2 0 0 0 2 2h9"/></>,
    screen: <><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4m-3-9 2-2 2 2 3-4"/></>,
    screenOff: <><path d="m3 3 18 18M10 3h10a2 2 0 0 1 2 2v10M2 8V5a2 2 0 0 1 2-2h1m-1 7v7a2 2 0 0 0 2 2h11M8 21h8m-4-4v4"/></>,
    headphones: <><path d="M3 14v-3a9 9 0 0 1 18 0v3"/><path d="M5 13h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Zm12 0h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Z"/></>,
    headphonesOff: <><path d="M3 14v-3a9 9 0 0 1 15.4-6.4M21 11v3M5 13h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Zm12 0h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1M2 2l20 20"/></>,
    close: <><path d="m18 6-12 12M6 6l12 12"/></>,
    maximize: <><path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3"/></>,
    exit: <><path d="M10 17l5-5-5-5m5 5H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></>,
    car: <><path d="m5 11 1.5-5h11L19 11l2 2v5h-2m-14 0H3v-5l2-2Z"/><path d="M5 11h14M7 18h10"/><circle cx="7" cy="18" r="1.5"/><circle cx="17" cy="18" r="1.5"/></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/></>,
    unlock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2m-3.5 9v3"/></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 17.4 6.4L20 9M4 15l2.6 2.6A7 7 0 0 0 18.4 15"/></>,
    office: <><path d="M3 21h18M5 21V5l7-3 7 3v16M9 9h.01M15 9h.01M9 13h.01M15 13h.01M10 21v-4h4v4"/></>,
    chat: <><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/></>,
    people: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...shared}>{drawings[name]}</svg>;
}
