export type WorkspaceTheme = "app" | "light" | "dark" | "system";

export const WORKSPACE_THEME_STORAGE_KEY = "gammyverse.workspace.theme";

export function parseWorkspaceTheme(value: string | null): WorkspaceTheme {
  return value === "light" || value === "dark" || value === "system" ? value : "app";
}

export function readWorkspaceTheme(): WorkspaceTheme {
  try { return parseWorkspaceTheme(localStorage.getItem(WORKSPACE_THEME_STORAGE_KEY)); }
  catch { return "app"; }
}

export function saveWorkspaceTheme(theme: WorkspaceTheme): void {
  try {
    if (localStorage.getItem(WORKSPACE_THEME_STORAGE_KEY) !== theme) localStorage.setItem(WORKSPACE_THEME_STORAGE_KEY, theme);
  } catch { /* Storage-disabled browsers keep the theme in memory for this tab. */ }
}
