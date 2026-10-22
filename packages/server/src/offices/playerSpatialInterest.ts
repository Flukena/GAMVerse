import type { Client } from "@colyseus/core";
import { StateView } from "@colyseus/schema";
import { PLAYER_SPATIAL_VIEW_TAG, type PlayerState } from "@gammyverse/shared";
import { proximityNeighbors } from "./proximityNeighbors.js";

export const PLAYER_SPATIAL_INTEREST_RADIUS_M = 100;
const DISTANT_MARKER_UPDATE_INTERVAL_MS = 1_000;

type Position = { x: number; z: number };

export class PlayerSpatialInterest {
  private readonly visibleByObserver = new Map<string, Set<string>>();
  private readonly viewByObserver = new Map<string, StateView>();
  private nextDistantMarkerUpdateAtMs = 0;

  updateMarkers(players: ReadonlyMap<string, PlayerState>, nowMs: number): void {
    if (nowMs < this.nextDistantMarkerUpdateAtMs) return;
    for (const player of players.values()) {
      player.markerX = player.x;
      player.markerZ = player.z;
      player.markerRotation = player.rotation;
    }
    this.nextDistantMarkerUpdateAtMs = nowMs + DISTANT_MARKER_UPDATE_INTERVAL_MS;
  }

  sync(clients: readonly Client[], players: ReadonlyMap<string, PlayerState>): void {
    const locations = [...players.entries()].map(([id, player]) => [id, player] as const satisfies readonly [string, Position]);
    const neighbors = proximityNeighbors(locations, this.visibleByObserver, PLAYER_SPATIAL_INTEREST_RADIUS_M).neighbors;
    for (const client of clients) {
      const view = client.view ??= new StateView();
      if (this.viewByObserver.get(client.sessionId) !== view) {
        this.viewByObserver.get(client.sessionId)?.dispose();
        this.viewByObserver.set(client.sessionId, view);
        this.visibleByObserver.delete(client.sessionId);
      }
      const next = new Set(neighbors.get(client.sessionId) ?? []);
      next.add(client.sessionId);
      const previous = this.visibleByObserver.get(client.sessionId) ?? new Set<string>();

      for (const sessionId of next) {
        if (previous.has(sessionId)) continue;
        const player = players.get(sessionId);
        if (player) view.add(player, PLAYER_SPATIAL_VIEW_TAG);
      }
      for (const sessionId of previous) {
        if (next.has(sessionId)) continue;
        const player = players.get(sessionId);
        if (player && view.hasTag(player, PLAYER_SPATIAL_VIEW_TAG)) view.remove(player, PLAYER_SPATIAL_VIEW_TAG);
      }
      this.visibleByObserver.set(client.sessionId, next);
    }
  }

  removeObserver(client: Client): void {
    client.view?.dispose();
    client.view = undefined;
    this.visibleByObserver.delete(client.sessionId);
    this.viewByObserver.delete(client.sessionId);
  }
}
