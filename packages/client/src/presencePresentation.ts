import type { UserStatus } from "@gammyverse/shared";

export const USER_STATUS_PRESENTATIONS: Record<UserStatus, { label: string; icon: string; badgeIcon: string; color: string }> = {
  available: { label: "Available", icon: "✓", badgeIcon: "✓", color: "#2f9e62" },
  "do-not-disturb": { label: "Busy (Do not disturb)", icon: "⊖", badgeIcon: "−", color: "#dc3545" },
  "in-meeting": { label: "In meeting", icon: "▣", badgeIcon: "▣", color: "#7950c7" },
  away: { label: "Away", icon: "◷", badgeIcon: "◷", color: "#ad7923" },
  toilet: { label: "Toilet", icon: "WC", badgeIcon: "WC", color: "#168aad" },
  lunch: { label: "Lunch", icon: "♨", badgeIcon: "♨", color: "#e08b22" },
  "coffee-break": { label: "Coffee break", icon: "☕", badgeIcon: "☕", color: "#8a5a35" },
};
