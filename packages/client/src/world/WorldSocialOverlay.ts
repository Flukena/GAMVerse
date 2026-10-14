import {
  Vector3,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  type Scene,
  type Camera,
} from "three";
import { nearestInteractiveProp, type RoomLayout } from "@gammyverse/shared";
import type { Map2dDecoration } from "./map2d/map2dDynamicLayer";

interface OverlayPlayer {
  x: number;
  z: number;
  handRaised?: boolean;
}
interface OverlayState {
  camera: Camera;
  players: ReadonlyMap<string, OverlayPlayer>;
  decorations: readonly Map2dDecoration[];
  localId: string | null;
  layout: RoomLayout | null;
  offsetX: number;
  offsetZ: number;
  visible: boolean;
  nowMs: number;
}
const SOCIAL_LABEL_HEIGHT_M = 3;
const SOCIAL_PROP_HEIGHT_M = 1;
const SOCIAL_OVERLAY_CLASS = "world-social-decoration";
const SOCIAL_LABEL_MAX_WIDTH_PX = 220;
const SOCIAL_LABEL_RADIUS_PX = 8;
const SOCIAL_LABEL_PADDING_Y_PX = 4;
const SOCIAL_LABEL_PADDING_X_PX = 8;
const SOCIAL_LABEL_BACKGROUND_COLOR = "#fff";
const SOCIAL_LABEL_TEXT_COLOR = "#15243d";
const SOCIAL_OVERLAY_Z_INDEX = 4;
const SOCIAL_HIGHLIGHT_INNER_RADIUS_M = 0.7;
const SOCIAL_HIGHLIGHT_OUTER_RADIUS_M = 0.9;
const SOCIAL_HIGHLIGHT_SEGMENTS_COUNT = 32;
const SOCIAL_HIGHLIGHT_HEIGHT_M = 0.06;
const SOCIAL_HIGHLIGHT_COLOR = "#f5c542";
const SOCIAL_REACTION_RISE_PX = 32;
const SOCIAL_LABEL_ANIMATION_MS = 600;
export class WorldSocialOverlay {
  private readonly root = document.createElement("div");
  private readonly highlight = new Mesh(
    new RingGeometry(
      SOCIAL_HIGHLIGHT_INNER_RADIUS_M,
      SOCIAL_HIGHLIGHT_OUTER_RADIUS_M,
      SOCIAL_HIGHLIGHT_SEGMENTS_COUNT,
    ),
    new MeshBasicMaterial({ color: SOCIAL_HIGHLIGHT_COLOR }),
  );
  private readonly labels = new Map<string, HTMLDivElement>();
  constructor(
    private readonly host: HTMLElement,
    scene: Scene,
  ) {
    Object.assign(this.root.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
      zIndex: String(SOCIAL_OVERLAY_Z_INDEX),
    });
    host.append(this.root);
    this.highlight.rotation.x = -Math.PI / 2;
    this.highlight.visible = false;
    scene.add(this.highlight);
  }
  frame(state: OverlayState): void {
    this.root.hidden = !state.visible;
    if (!state.visible) {
      this.highlight.visible = false;
      return;
    }
    const active = new Set<string>();
    for (const [sessionId, player] of state.players) {
      const texts = state.decorations
        .filter(
          (item) =>
            item.sessionId === sessionId && item.expiresAtMs > state.nowMs,
        )
        .map((item) => item.text);
      if (player.handRaised) texts.push("✋");
      if (!texts.length) continue;
      active.add(sessionId);
      this.show(
        sessionId,
        texts.join(" "),
        player.x + state.offsetX,
        player.z + state.offsetZ,
        SOCIAL_LABEL_HEIGHT_M,
        state.camera,
      );
    }
    this.interaction(state, active);
    for (const [key, label] of this.labels)
      if (!active.has(key)) {
        label.remove();
        this.labels.delete(key);
      }
  }
  private interaction(state: OverlayState, active: Set<string>): void {
    const local = state.localId ? state.players.get(state.localId) : undefined;
    const nearest =
      local && state.layout
        ? nearestInteractiveProp(state.layout.props, local)
        : null;
    this.highlight.visible = Boolean(nearest);
    if (!nearest) return;
    this.highlight.position.set(
      nearest.x + state.offsetX,
      SOCIAL_HIGHLIGHT_HEIGHT_M,
      nearest.z + state.offsetZ,
    );
    active.add("interaction");
    this.show(
      "interaction",
      `◉ X to open: ${nearest.interaction?.title}`,
      nearest.x + state.offsetX,
      nearest.z + state.offsetZ,
      SOCIAL_PROP_HEIGHT_M,
      state.camera,
    );
  }
  private show(
    key: string,
    text: string,
    x: number,
    z: number,
    heightM: number,
    camera: Camera,
  ): void {
    let label = this.labels.get(key);
    if (!label) {
      label = document.createElement("div");
      label.className = SOCIAL_OVERLAY_CLASS;
      Object.assign(label.style, {
        position: "absolute",
        background: SOCIAL_LABEL_BACKGROUND_COLOR,
        color: SOCIAL_LABEL_TEXT_COLOR,
        borderRadius: `${SOCIAL_LABEL_RADIUS_PX}px`,
        padding: `${SOCIAL_LABEL_PADDING_Y_PX}px ${SOCIAL_LABEL_PADDING_X_PX}px`,
        transform: "translate(-50%,-100%)",
        maxWidth: `${SOCIAL_LABEL_MAX_WIDTH_PX}px`,
        overflowWrap: "anywhere",
      });
      this.root.append(label);
      this.labels.set(key, label);
    }
    const point = new Vector3(x, heightM, z).project(camera);
    if (label.textContent !== text)
      label.animate(
        [
          { marginTop: `${SOCIAL_REACTION_RISE_PX}px`, opacity: 0 },
          { marginTop: "0px", opacity: 1 },
        ],
        { duration: SOCIAL_LABEL_ANIMATION_MS },
      );
    label.textContent = text;
    label.hidden = point.z < -1 || point.z > 1;
    label.style.left = `${((point.x + 1) * this.host.clientWidth) / 2}px`;
    label.style.top = `${((1 - point.y) * this.host.clientHeight) / 2}px`;
  }
  dispose(): void {
    this.root.remove();
    this.labels.clear();
    this.highlight.removeFromParent();
    this.highlight.geometry.dispose();
    this.highlight.material.dispose();
  }
}
