export type WorkspaceTheme = "light" | "dark" | "system";
export const WORKSPACE_THEME_STORAGE_KEY = "gamverse.workspace.theme";
export const WORKSPACE_DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

export function parseWorkspaceTheme(value: string | null): WorkspaceTheme {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolveWorkspaceTheme(theme: WorkspaceTheme, systemDark: boolean): "light" | "dark" {
  return theme === "system" ? (systemDark ? "dark" : "light") : theme;
}

export function readWorkspaceTheme(): WorkspaceTheme {
  try { return parseWorkspaceTheme(localStorage.getItem(WORKSPACE_THEME_STORAGE_KEY)); }
  catch (error) {
    if (error instanceof DOMException) return "system";
    throw error;
  }
}

export function saveWorkspaceTheme(theme: WorkspaceTheme): void {
  try {
    if (localStorage.getItem(WORKSPACE_THEME_STORAGE_KEY) !== theme) localStorage.setItem(WORKSPACE_THEME_STORAGE_KEY, theme);
  } catch (error) {
    if (!(error instanceof DOMException)) throw error;
  }
}
