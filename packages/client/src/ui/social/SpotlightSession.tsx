import { createOfficeMediaSession } from "../media/officeMediaSession";
import type { SpotlightRequest } from "@gammyverse/shared";
import { useEffect, useRef, useState } from "react";
import type { RemoteAudioTrack, RemoteTrack, Room } from "livekit-client";
import { createVoiceRoom } from "../media/voiceRoomSdk";
import { VoiceRoomSession } from "../media/voiceRoomSession";
import { voiceParticipantUsername } from "../media/mediaIdentity";
import { VoiceTokenError } from "../media/voiceToken";
import {
  canPublishSpotlight,
  isSpotlightConsentCurrent,
  type SpotlightConsent,
  mediaTileKey,
  spotlightAudioVolume,
  spotlightSessionKey,
  shouldRestoreSpotlightCamera,
} from "./socialState";

interface SpotlightProps {
  endpoint: string;
  officeId: string;
  sessionKey: string;
  epoch: string;
  usernames: readonly string[];
  incomingRequests: readonly SpotlightRequest[];
  outgoingRequests: readonly SpotlightRequest[];
  commandError: string | null;
  spotlighted: boolean;
  doNotDisturb: boolean;
  zoneUsernames: ReadonlySet<string>;
  paused: boolean;
  onAcceptRequest(requestId: string): void;
  onDeclineRequest(requestId: string): void;
  onCancelRequest(requestId: string): void;
  onLeave(): void;
}
interface SpotlightTrack {
  key: string;
  track: RemoteTrack;
  username: string;
}
const SPOTLIGHT_TOKEN_ERROR_LABEL = "Could not authorize spotlight.";
export function SpotlightSession({
  endpoint,
  officeId,
  sessionKey,
  epoch,
  usernames,
  incomingRequests,
  outgoingRequests,
  commandError,
  spotlighted,
  doNotDisturb,
  zoneUsernames,
  paused,
  onAcceptRequest,
  onDeclineRequest,
  onCancelRequest,
  onLeave,
}: SpotlightProps) {
  const [consent, setConsent] = useState<SpotlightConsent | null>(null);
  const consentedEpoch = isSpotlightConsentCurrent(
    consent,
    officeId,
    sessionKey,
  )
    ? (consent?.epoch ?? null)
    : null;
  const consented = canPublishSpotlight(consentedEpoch, epoch, spotlighted);
  const teardownRef = useRef<Promise<void>>(Promise.resolve());
  const [camera, setCamera] = useState(false);
  const cameraIntentRef = useRef(false);
  cameraIntentRef.current = shouldRestoreSpotlightCamera(
    consentedEpoch,
    epoch,
    spotlighted,
    camera,
  );
  const [tracks, setTracks] = useState<SpotlightTrack[]>([]);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<VoiceRoomSession<Room> | null>(null);
  const consentRef = useRef(false);
  consentRef.current = consented && spotlighted;
  useEffect(() => {
    if (!spotlighted) {
      setConsent(null);
      setCamera(false);
    }
  }, [spotlighted]);
  const connectKey = spotlightSessionKey(epoch, usernames, paused);
  useEffect(() => {
    if (connectKey === null) return;
    const session = createOfficeMediaSession<Room>(
      {
        initialMuted: true,
        previousTeardown: teardownRef.current,
        createRoom: createVoiceRoom,
        fetchToken: async (_target, signal) => {
          const response = await fetch(`${endpoint}/media/spotlight-token`, {
            method: "POST",
            credentials: "include",
            signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ officeId, publish: consentRef.current }),
          });
          if (!response.ok)
            throw new VoiceTokenError(
              SPOTLIGHT_TOKEN_ERROR_LABEL,
              response.status,
            );
          return (await response.json()) as { url: string; token: string };
        },
      },
      {
        stateChanged: (state) => {
          setError(state.error?.message ?? null);
          if (state.connected && state.muted && consentRef.current)
            void session.setMuted(false);
        },
        roomChanged: (room) => {
          if (!room) setTracks([]);
          else if (cameraIntentRef.current)
            void session.control((activeRoom) =>
              activeRoom.localParticipant.setCameraEnabled(true),
            );
        },
        trackSubscribed: (room, track, publication, participant) => {
          const username = voiceParticipantUsername(participant);
          const key = mediaTileKey(
            room.name,
            participant.identity,
            publication.source,
          );
          setTracks((current) => [
            ...current.filter((item) => item.key !== key),
            { key, track, username },
          ]);
        },
        trackUnsubscribed: (_room, track) =>
          setTracks((current) =>
            current.filter((item) => item.track !== track),
          ),
      },
    );
    sessionRef.current = session;
    session.setTarget({ kind: "spotlight", id: connectKey, officeId, sessionKey });
    return () => {
      sessionRef.current = null;
      teardownRef.current = session.dispose();
    };
  }, [
    endpoint,
    officeId,
    sessionKey,
    connectKey,
    consented,
  ]);
  if (usernames.length === 0 && incomingRequests.length === 0 && outgoingRequests.length === 0 && !commandError) return null;

  return (
    <section className="gather-spotlight" aria-label="Spotlight">
      {usernames.length > 0 && <header className="spotlight-header">
        <span className="spotlight-live-indicator" aria-hidden="true" />
        <div><strong>Spotlight is live</strong><small>{usernames.join(", ")}</small></div>
      </header>}
      {spotlighted && !consented && (
        <div className="spotlight-invitation">
          <p>You’ve been invited to speak to everyone in this office. Your microphone stays off until you choose to share.</p>
          <button className="spotlight-primary-action" type="button" onClick={() => setConsent({ epoch, officeId, sessionKey })}>Share microphone</button>
          <button type="button" className="spotlight-stop-action" onClick={onLeave}>Leave spotlight</button>
        </div>
      )}
      {spotlighted && consented && (
        <div className="spotlight-publisher-controls">
          <p className="spotlight-sharing-status" role="status">Your microphone is shared with the office.</p>
          <button type="button" className="spotlight-secondary-action" onClick={() => {
            const next = !camera;
            setCamera(next);
            void sessionRef.current?.control((room) => room.localParticipant.setCameraEnabled(next));
          }}>{camera ? "Turn camera off" : "Share camera"}</button>
          <button type="button" className="spotlight-secondary-action" onClick={() => { setConsent(null); setCamera(false); }}>Turn microphone off</button>
          <button type="button" className="spotlight-stop-action" onClick={onLeave}>Leave spotlight</button>
        </div>
      )}
      {incomingRequests.map(request => <article className="spotlight-request" key={request.id} aria-label="Spotlight request">
        <strong>{request.fromUsername} invited you to Spotlight</strong>
        <p>Your microphone stays off until you choose to share.</p>
        <div><button type="button" className="spotlight-primary-action" onClick={() => onAcceptRequest(request.id)}>Accept</button>
          <button type="button" className="spotlight-secondary-action" onClick={() => onDeclineRequest(request.id)}>Decline</button></div>
      </article>)}
      {outgoingRequests.map(request => <article className="spotlight-request" key={request.id} aria-label="Pending spotlight request">
        <strong>Spotlight request sent to {request.targetUsername}</strong>
        <button type="button" className="spotlight-stop-action" onClick={() => onCancelRequest(request.id)}>Cancel request</button>
      </article>)}
      {commandError && <p className="spotlight-error" role="alert">{commandError}</p>}
      {usernames.length > 0 && !spotlighted && <p className="spotlight-listener-note">Spotlight audio is shared with everyone in the office.</p>}
      {error && <p className="spotlight-error" role="alert">Spotlight connection failed: {error}</p>}
      {tracks.length > 0 && <div className="spotlight-media-grid" aria-label="Spotlight video">{tracks.map((item) => (
        <SpotlightMedia
          key={item.key}
          item={item}
          volume={spotlightAudioVolume(doNotDisturb, zoneUsernames.has(item.username))}
        />
      ))}</div>}
    </section>
  );
}
function SpotlightMedia({
  item,
  volume,
}: {
  item: SpotlightTrack;
  volume: number;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = item.track.attach();
    elementRef.current?.append(element);
    return () => {
      item.track.detach(element);
      element.remove();
    };
  }, [item.track]);
  useEffect(() => {
    if (item.track.kind === "audio")
      (item.track as RemoteAudioTrack).setVolume(volume);
  }, [item.track, volume]);
  return <div ref={elementRef} aria-label={item.username} />;
}
