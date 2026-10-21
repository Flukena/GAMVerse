import { MAP2D_VIEW_STORAGE_KEY } from "./map2d/constants";

const WEBGL_FAILURE_KEY = "gammyverse.webgl.failed";

export function webglFailedInThisTab(): boolean {
  try { return sessionStorage.getItem(WEBGL_FAILURE_KEY) === "1"; }
  catch { return false; }
}

export function rememberWebglFailure(): void {
  try { sessionStorage.setItem(WEBGL_FAILURE_KEY, "1"); }
  catch { /* Private browsing may disable storage. */ }
}

export function retryWebglAfterReload(): void {
  try { sessionStorage.removeItem(WEBGL_FAILURE_KEY); }
  catch { /* A reload still gives the browser another attempt. */ }
  try { localStorage.setItem(MAP2D_VIEW_STORAGE_KEY, "3d"); }
  catch { /* Storage-disabled devices keep the current preference. */ }
  window.location.reload();
}
