import { useEffect, useState } from "react";
import { readWorkspaceTheme, resolveWorkspaceTheme, saveWorkspaceTheme, WORKSPACE_DARK_MEDIA_QUERY, WORKSPACE_THEME_STORAGE_KEY, type WorkspaceTheme } from "./workspaceTheme";
import "./WorkspaceShell.css";

export function useWorkspaceTheme() {
  const [theme, setTheme] = useState<WorkspaceTheme>(readWorkspaceTheme);
  useEffect(() => {
    const media = window.matchMedia(WORKSPACE_DARK_MEDIA_QUERY);
    const apply = () => { document.documentElement.dataset.workspaceTheme = resolveWorkspaceTheme(theme, media.matches); };
    apply();
    saveWorkspaceTheme(theme);
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === WORKSPACE_THEME_STORAGE_KEY || event.key === null) setTheme(readWorkspaceTheme());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  return { theme, setTheme };
}
