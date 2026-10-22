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
  chatTargetRevision?: number;
  chatContainer: HTMLElement | null;
  chatVisible: boolean;
  onUnread(count: number): void;
  inboundAudioMuted: boolean;
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
        targetRevision={props.chatTargetRevision}
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
          incomingRequests={social.spotlightRequests.incoming}
          outgoingRequests={social.spotlightRequests.outgoing}
          commandError={social.spotlightCommandError}
          spotlighted={social.spotlight.usernames.includes(props.username)}
          inboundAudioMuted={props.inboundAudioMuted}
          zoneUsernames={props.zoneUsernames}
          paused={!props.room}
          onAcceptRequest={requestId => props.room?.send("spotlight", { action: "respond", requestId, accept: true })}
          onDeclineRequest={requestId => props.room?.send("spotlight", { action: "respond", requestId, accept: false })}
          onCancelRequest={requestId => props.room?.send("spotlight", { action: "cancel", requestId })}
          onLeave={() => props.room?.send("spotlight", { action: "stop", targetUsername: props.username })}
        />
      )}
    </>
  );
}
