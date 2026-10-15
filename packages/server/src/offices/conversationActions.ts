import { PUBLIC_CONVERSATIONS_EVENT, type PlayerState } from "@gammyverse/shared";
import { getSession } from "../auth/service.js";
import { getOfficeRole } from "./repository.js";
import { readReconnectAccess, type SessionSecurity } from "./sessionSecurity.js";
import { MeetMessages, registerMeetMessages } from "./meetMessages.js";
import type { MeetGeometry, MeetRoutePlan, MeetTravelParticipant } from "./meetRoutePlanner.js";
import { PublicConversations, publicConversationSummaries } from "./publicConversations.js";
import { PublicConversationMessages, registerPublicConversationMessages } from "./publicConversationMessages.js";
import type { SpatialConversations } from "./spatialConversations.js";
const PUBLIC_DISCOVERY_REFRESH_INTERVAL_MS = 1000;
type ActionRoom = Parameters<typeof registerPublicConversationMessages>[0];
export type ConversationActionState = {
  players: ReadonlyMap<string, PlayerState>;
  security: SessionSecurity;
  editingSessionId(): string | null;
  conversations: SpatialConversations;
  geometry(): MeetGeometry;
  commit(plan: MeetRoutePlan): void;
  send(sessionId: string, event: string, payload: unknown): void;
  broadcast(event: string, payload: unknown): void;
};
/** Coordinates spatial offers/discovery without owning movement or media transport. */
export class ConversationActions {
  private readonly discovery: PublicConversations;
  private readonly publicMessages: PublicConversationMessages;
  private readonly meet: MeetMessages;
  private readonly disposeMeet: () => void;
  private lastRefreshAtMs = -PUBLIC_DISCOVERY_REFRESH_INTERVAL_MS;
  constructor(private readonly officeId: string, room: ActionRoom, private readonly state: ConversationActionState) {
    this.discovery = new PublicConversations(officeId,state.conversations.roomIncarnationId);
    const navigation = {participant: (id: string) => this.participant(id), geometry: state.geometry, commit: state.commit,send: state.send};
    this.meet = new MeetMessages(officeId,state.conversations.roomIncarnationId,navigation,{
      role: async username => {const id=state.security.activeSession(username);return id && await this.authorize(id,username) ? "user" : null;},
    });
    this.disposeMeet = registerMeetMessages(room,this.meet);
    this.publicMessages = new PublicConversationMessages({...navigation,authorize:(id,username)=>this.authorize(id,username),
      conversation:id=>this.resolve(id),navigationIntent:id=>this.navigationIntent(id)},this.discovery);
    registerPublicConversationMessages(room,this.publicMessages);
  }
  participant(sessionId: string): MeetTravelParticipant | undefined {
    const player = this.state.players.get(sessionId);
    if (!player) return undefined;
    return {username:player.username,sessionId,displayName:player.displayName || player.username,x:player.x,z:player.z,status:player.status,
      presence:player.presence,vehicleId:player.vehicleId,active:sessionId !== this.state.editingSessionId() && !this.state.security.isRevoked(sessionId) && this.state.security.activeSession(player.username)===sessionId};
  }
  private async authorize(sessionId: string, username: string): Promise<boolean> {
    const access = await readReconnectAccess(username,this.state.security.token(sessionId),this.officeId,{account:getSession,officeRole:getOfficeRole});
    return access.accountActive && access.officeMember && this.participant(sessionId)?.active === true;
  }
  navigationIntent(sessionId: string) {this.meet.intentChanged(sessionId);this.publicMessages.invalidate(sessionId);}
  invalidateApproach(sessionId: string) {this.publicMessages.invalidate(sessionId);}
  removeSession(sessionId: string) {this.meet.removeSession(sessionId);this.publicMessages.removeSession(sessionId);}
  mapChanged() {this.meet.mapChanged();for(const id of this.state.players.keys())this.publicMessages.invalidate(id);}
  dispose() {this.disposeMeet();for(const id of this.state.players.keys())this.publicMessages.removeSession(id);}
  private summaries() {
    const positions = new Map([...this.state.players].filter(([id,player])=>player.presence==="online" && !this.state.security.isRevoked(id) && this.state.security.activeSession(player.username)===id));
    const geometry=this.state.geometry();
    return publicConversationSummaries(this.state.conversations.all(),positions,new Map(geometry.layout.zones.map(zone=>[zone.id,zone])),geometry.lockedZoneIds);
  }
  private resolve(id: string) {
    const summary=this.summaries().find(conversation=>conversation.id===id);
    if (!summary)return undefined;
    const conversation=this.state.conversations.all().find(conversation=>conversation.id===id);
    return {summary,meetingZoneId:conversation?.kind==="meeting" ? conversation.mediaTarget.id : undefined};
  }
  refresh(force: boolean) {
    this.meet.enforceAvailability();
    const nowMs=performance.now();
    if (!force && nowMs-this.lastRefreshAtMs<PUBLIC_DISCOVERY_REFRESH_INTERVAL_MS)return;
    this.lastRefreshAtMs=nowMs;
    if(this.discovery.reconcile(this.summaries()))this.state.broadcast(PUBLIC_CONVERSATIONS_EVENT,this.discovery.snapshot());
  }
}
