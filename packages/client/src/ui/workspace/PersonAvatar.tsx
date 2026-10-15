import { useState } from "react";
import { characterPortraitPreviewUrl } from "../../assets/characterPortraitPaths";
import type { DirectoryPerson } from "./peopleDirectory";

const INITIAL_LENGTH_CHARS = 1;
export function PersonAvatar({ person }: { person: DirectoryPerson }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const previewUrl = person.characterId ? characterPortraitPreviewUrl(person.characterId) : null;
  const name = person.displayName || person.username;
  return <span className="directory-avatar" aria-hidden="true">
    {previewUrl && previewUrl !== failedUrl ? <img src={previewUrl} alt="" onError={() => setFailedUrl(previewUrl)} /> : name.slice(0, INITIAL_LENGTH_CHARS).toLocaleUpperCase()}
    <i className={`directory-presence ${person.presence}`} />
  </span>;
}
