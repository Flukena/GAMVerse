import { ChatPanel, type ChatTransport } from "./ChatPanel";
import { PropInteractionModal } from "./PropInteractionPanel";
import { SocialControls } from "./SocialControls";
import { SpotlightSession } from "./SpotlightSession";
import type { useOfficeSocial } from "./useOfficeSocial";

interface OfficeSocialOverlayProps {
  social: ReturnType<typeof useOfficeSocial>;
  room: ChatTransport | null;
  endpoint: string;
  officeId: string;
  username: string;
  sessionKey: string | null;
  chatTarget: string | null;
  chatContainer: HTMLElement | null;
  chatVisible: boolean;
  onUnread(count: number): void;
  doNotDisturb: boolean;
  zoneUsernames: ReadonlySet<string>;
}

export function OfficeSocialOverlay(props: OfficeSocialOverlayProps) {
  const { social } = props;
  return (
    <>
      <ChatPanel
        room={props.room}
        endpoint={props.endpoint}
        officeId={props.officeId}
        username={props.username}
        target={props.chatTarget}
        container={props.chatContainer}
        visible={props.chatVisible}
        onUnread={props.onUnread}
        onNearby={social.nearbyMessage}
      />
      <SocialControls
        nearestTitle={social.nearestTitle}
      />
      {social.interaction && (
        <PropInteractionModal
          interaction={social.interaction}
          onClose={social.closeInteraction}
        />
      )}
      {props.sessionKey && (
        <SpotlightSession
          endpoint={props.endpoint}
          officeId={props.officeId}
          sessionKey={props.sessionKey}
          epoch={social.spotlight.epoch}
          usernames={social.spotlight.usernames}
          spotlighted={social.spotlight.usernames.includes(props.username)}
          doNotDisturb={props.doNotDisturb}
          zoneUsernames={props.zoneUsernames}
          paused={!props.room}
        />
      )}
    </>
  );
}
