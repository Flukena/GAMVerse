import { useCallback, useState } from "react";
import { MAP2D_PRESENTATION_STORAGE_KEY, parseMap2dPresentationPreference, resolveMap2dPresentation,
  type Map2dPresentationPreference } from "./map2dPresentation";

function readPreference(): Map2dPresentationPreference {
  try { return parseMap2dPresentationPreference(localStorage.getItem(MAP2D_PRESENTATION_STORAGE_KEY)); }
  catch { return "auto"; }
}
export function useMap2dPresentation(scalePxPerM: number) {
  const [preference, updatePreference] = useState(readPreference);
  const [previous, setPrevious] = useState(() => resolveMap2dPresentation(preference, scalePxPerM));
  const presentation = resolveMap2dPresentation(preference, scalePxPerM, previous);
  if (presentation !== previous) setPrevious(presentation);
  const setPreference = useCallback((value: Map2dPresentationPreference) => {
    updatePreference(value);
    try { localStorage.setItem(MAP2D_PRESENTATION_STORAGE_KEY, value); }
    catch { /* Storage-disabled browsers retain the selection for this session. */ }
  }, []);
  return { preference, presentation, setPreference };
}
