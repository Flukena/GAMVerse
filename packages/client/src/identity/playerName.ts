/** Name decoration is based only on the authenticated role in server presence. */
export function playerName(player: { displayName: string; isMaintainer?: boolean }, local = false): string {
  const name = local ? "You" : player.displayName;
  return player.isMaintainer === true ? `${name} (MAINTAINER)` : name;
}
