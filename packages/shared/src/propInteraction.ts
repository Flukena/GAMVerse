export const PROP_INTERACTION_MAX_TITLE_CHARS = 100;
export const PROP_INTERACTION_MAX_TEXT_CHARS = 10_000;
export const PROP_INTERACTION_MAX_URL_CHARS = 2_048;
export const INTERACT_RADIUS_M = 3;
export type PropInteraction = {
  kind: "link" | "note" | "embed";
  title: string;
  url?: string;
  text?: string;
};
export type InteractivePosition = {
  id: string;
  x: number;
  z: number;
  interaction?: PropInteraction;
};

export function safeInteractionUrl(value: unknown): URL | null {
  if (
    typeof value !== "string" ||
    value.length > PROP_INTERACTION_MAX_URL_CHARS
  )
    return null;
  const parsed = URL.canParse(value) ? new URL(value) : null;
  if (
    !parsed ||
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port
  )
    return null;
  return parsed;
}
export function isValidPropInteraction(
  value: unknown,
): value is PropInteraction {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Partial<PropInteraction>;
  if (
    typeof p.title !== "string" ||
    !p.title.trim() ||
    p.title.length > PROP_INTERACTION_MAX_TITLE_CHARS
  )
    return false;
  if (p.kind === "note")
    return (
      typeof p.text === "string" &&
      p.text.length <= PROP_INTERACTION_MAX_TEXT_CHARS
    );
  return (
    (p.kind === "link" || p.kind === "embed") &&
    safeInteractionUrl(p.url) !== null
  );
}
function youtubeEmbed(url: URL): string | null {
  const id =
    url.hostname === "youtu.be"
      ? url.pathname.slice(1)
      : (url.searchParams.get("v") ??
        url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)$/)?.[1]);
  return id && /^[a-zA-Z0-9_-]{11}$/.test(id)
    ? `https://www.youtube.com/embed/${id}`
    : null;
}
function googleEmbed(url: URL): string | null {
  const match = /^\/(document|presentation)\/d\/([\w-]+)(?:\/|$)/.exec(
    url.pathname,
  );
  if (!match) return null;
  return `https://docs.google.com/${match[1]}/d/${match[2]}/${match[1] === "document" ? "preview" : "embed"}`;
}
function figmaEmbed(url: URL): string | null {
  const match = /^\/(file|design|proto)\/([\w-]+)(?:\/|$)/.exec(url.pathname);
  if (!match) return null;
  const canonical = `https://www.figma.com/${match[1]}/${match[2]}`;
  return `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(canonical)}`;
}
function miroEmbed(url: URL): string | null {
  const match = /^\/app\/(?:board|live-embed)\/([\w=-]+)\/?$/.exec(
    url.pathname,
  );
  return match
    ? `https://miro.com/app/live-embed/${encodeURIComponent(match[1])}/`
    : null;
}
function excalidrawEmbed(url: URL): string | null {
  if (url.pathname !== "/" || !/^#room=[\w-]+,[\w-]+$/.test(url.hash))
    return null;
  return `https://excalidraw.com/${url.hash}`;
}
const EMBED_CONVERTERS: Readonly<Record<string, (url: URL) => string | null>> =
  {
    "youtube.com": youtubeEmbed,
    "www.youtube.com": youtubeEmbed,
    "youtu.be": youtubeEmbed,
    "docs.google.com": googleEmbed,
    "figma.com": figmaEmbed,
    "www.figma.com": figmaEmbed,
    "miro.com": miroEmbed,
    "www.miro.com": miroEmbed,
    "excalidraw.com": excalidrawEmbed,
  };
export function canonicalEmbedUrl(value: string): string | null {
  const url = safeInteractionUrl(value);
  return url ? (EMBED_CONVERTERS[url.hostname]?.(url) ?? null) : null;
}
export function normalizePropInteraction(
  value: unknown,
): PropInteraction | undefined {
  if (!isValidPropInteraction(value)) return undefined;
  const title = value.title.trim();
  if (value.kind === "note") return { kind: "note", title, text: value.text };
  const url = safeInteractionUrl(value.url)!;
  return {
    kind:
      value.kind === "embed" && canonicalEmbedUrl(url.href) ? "embed" : "link",
    title,
    url: url.href,
  };
}
export function nearestInteractiveProp<T extends InteractivePosition>(
  props: readonly T[],
  position: { x: number; z: number },
  radiusM = INTERACT_RADIUS_M,
): T | null {
  let nearest: T | null = null;
  let distanceSquared = radiusM * radiusM;
  for (const prop of props) {
    if (!prop.interaction) continue;
    const candidate = (prop.x - position.x) ** 2 + (prop.z - position.z) ** 2;
    if (candidate <= distanceSquared) {
      nearest = prop;
      distanceSquared = candidate;
    }
  }
  return nearest;
}
