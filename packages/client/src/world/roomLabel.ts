/** Compact room names for dense office maps, preserving room numbers. */
export function abbreviateRoomName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => {
      const token = part.replace(/[^\p{L}\p{N}]/gu, "");
      if (!token) return "";
      if (/^\p{N}+$/u.test(token)) return token;
      const match = token.match(/^(\p{L})\p{L}*(\p{N}*)$/u);
      return match ? `${match[1]}${match[2]}` : token.slice(0, 1);
    })
    .join("");
}
