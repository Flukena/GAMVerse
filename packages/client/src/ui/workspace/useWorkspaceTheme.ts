import { useEffect, useState } from "react";
import { readWorkspaceTheme, saveWorkspaceTheme, WORKSPACE_THEME_STORAGE_KEY, type WorkspaceTheme } from "./workspaceTheme";
import "./WorkspaceShell.css";

export function useWorkspaceTheme() {
  const [theme, setTheme] = useState<WorkspaceTheme>(readWorkspaceTheme);

  useEffect(() => {
    document.documentElement.dataset.appTheme = theme;
    saveWorkspaceTheme(theme);
  }, [theme]);

  useEffect(() => {
    const syncTheme = (event: StorageEvent) => {
      if (event.key === WORKSPACE_THEME_STORAGE_KEY || event.key === null) setTheme(readWorkspaceTheme());
    };
    window.addEventListener("storage", syncTheme);
    return () => window.removeEventListener("storage", syncTheme);
  }, []);

  return { theme, setTheme };
}
