import type { Spotlight } from "../offices/spotlight.js";
type Token = {
  url: string;
  roomName: string;
  token: string;
};
type Dependencies = {
  role: () => Promise<string | null>;
  mint: (roomName: string, publish: boolean) => Promise<Token>;
};
export class SpotlightAuthorizationError extends Error {}
export async function mintSpotlightGrant(
  spotlight: Spotlight,
  username: string,
  identity: string,
  publish: boolean,
  dependencies: Dependencies,
) {
  if (!(await dependencies.role()))
    throw new SpotlightAuthorizationError("Office access denied.");
  const grant = spotlight.grant(username, publish);
  if (!grant)
    throw new SpotlightAuthorizationError("Spotlight publish access denied.");
  spotlight.track(username, identity);
  const token = await dependencies.mint(grant.roomName, publish);
  const role = await dependencies.role();
  const current = spotlight.grant(username, publish);
  if (
    !role ||
    !current ||
    current.epoch !== grant.epoch ||
    !spotlight.isTracked(username, identity)
  )
    throw new SpotlightAuthorizationError("Spotlight access changed.");
  return { ...token, ...grant };
}
