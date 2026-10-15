import { useEffect, useRef, type MutableRefObject } from "react";
import { CAMPUS_WORLD, type RoomLayout } from "@gammyverse/shared";
import { Map2dStaticLayer } from "../world/map2d/map2dStaticLayer";
import {
  fitMap2dProjection,
  worldToScreen,
  type Map2dPoint,
  type Map2dProjection,
} from "../world/map2d/map2dProjection";
const MINIMAP_Z_INDEX = 5;
const MINIMAP_PLAYER_COLOR_CSS = "#159bb4";
const MINIMAP_WIDTH_PX = 180;
const MINIMAP_HEIGHT_PX = 180;
const MINIMAP_ZOOM_FACTOR = 3.24;
const MINIMAP_MAP_OPACITY = 1;
const MINIMAP_DOT_RADIUS_PX = 5;
const MINIMAP_EDGE_PADDING_PX = 8;
const MINIMAP_REFRESH_INTERVAL_MS = 100;
const MINIMAP_FULL_CIRCLE_RAD = Math.PI * 2;
type Props = {
  layout: RoomLayout | null;
  configVersion: number;
  playersRef: MutableRefObject<Map<string, Map2dPoint & { presence?: string }>>;
  localSessionIdRef: MutableRefObject<string | null>;
  cameraYawRef: MutableRefObject<number>;
  hidden: boolean;
};
export function minimapProjection(
  widthM: number,
  depthM: number,
): Map2dProjection {
  const projection = fitMap2dProjection(
    widthM,
    depthM,
    MINIMAP_WIDTH_PX,
    MINIMAP_HEIGHT_PX,
  );
  return { ...projection, pxPerM: projection.pxPerM * MINIMAP_ZOOM_FACTOR };
}
export function Minimap({
  layout,
  configVersion,
  playersRef,
  localSessionIdRef,
  cameraYawRef,
  hidden,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compassRoseRef = useRef<HTMLDivElement>(null);
  const dimensions = layout?.dimensions ?? CAMPUS_WORLD;
  const projection = minimapProjection(dimensions.width, dimensions.depth);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const layer = new Map2dStaticLayer();
    layer.update(
      layout,
      dimensions.width,
      dimensions.depth,
      configVersion,
      projection.pxPerM,
    );
    const draw = () => {
      canvas.style.display = hidden ? "none" : "block";
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, MINIMAP_WIDTH_PX, MINIMAP_HEIGHT_PX);
      const localPlayer = localSessionIdRef.current
        ? playersRef.current.get(localSessionIdRef.current)
        : undefined;
      const mapProjection = localPlayer
        ? { ...projection, center: { x: localPlayer.x, z: localPlayer.z } }
        : projection;
      const yaw = cameraYawRef.current;
      ctx.save();
      ctx.translate(MINIMAP_WIDTH_PX / 2, MINIMAP_HEIGHT_PX / 2);
      ctx.rotate(-yaw);
      ctx.translate(-MINIMAP_WIDTH_PX / 2, -MINIMAP_HEIGHT_PX / 2);
      ctx.globalAlpha = MINIMAP_MAP_OPACITY;
      layer.blit(ctx, mapProjection);
      ctx.restore();
      for (const [sessionId, player] of playersRef.current) {
        if (sessionId === localSessionIdRef.current || player.presence === "away") continue;
        const point = worldToScreen(mapProjection, player);
        const dx = point.x - MINIMAP_WIDTH_PX / 2;
        const dy = point.y - MINIMAP_HEIGHT_PX / 2;
        const cos = Math.cos(-yaw);
        const sin = Math.sin(-yaw);
        const rotatedX = MINIMAP_WIDTH_PX / 2 + dx * cos - dy * sin;
        const rotatedY = MINIMAP_HEIGHT_PX / 2 + dx * sin + dy * cos;
        const radius = Math.min(MINIMAP_WIDTH_PX, MINIMAP_HEIGHT_PX) / 2 - MINIMAP_EDGE_PADDING_PX;
        const fromCenterX = rotatedX - MINIMAP_WIDTH_PX / 2;
        const fromCenterY = rotatedY - MINIMAP_HEIGHT_PX / 2;
        if (fromCenterX * fromCenterX + fromCenterY * fromCenterY > radius * radius) continue;
        ctx.beginPath();
        ctx.arc(
          rotatedX,
          rotatedY,
          MINIMAP_DOT_RADIUS_PX - 1,
          0,
          MINIMAP_FULL_CIRCLE_RAD,
        );
        ctx.fillStyle = MINIMAP_PLAYER_COLOR_CSS;
        ctx.fill();
      }
      if (compassRoseRef.current) {
        // The map's screen-space projection has +Z pointing down, so its
        // north-up correction is opposite to the camera yaw. Keep the rose
        // aligned with that corrected map orientation.
        compassRoseRef.current.style.transform = `rotate(${((Math.PI - yaw) * 180) / Math.PI}deg)`;
      }
    };
    draw();
    const timer = window.setInterval(draw, MINIMAP_REFRESH_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
      layer.dispose();
    };
  }, [
    layout,
    configVersion,
    playersRef,
    localSessionIdRef,
    cameraYawRef,
    hidden,
    dimensions.width,
    dimensions.depth,
    projection.pxPerM,
  ]);
  return (
    <div data-tutorial-target="office-minimap" className="office-minimap-frame" role="img" aria-label="Compass and minimap. Your position stays centered; the map rotates with your view.">
      <canvas
        ref={canvasRef}
        className="office-minimap"
        width={MINIMAP_WIDTH_PX}
        height={MINIMAP_HEIGHT_PX}
        aria-hidden="true"
      />
      <div className="office-minimap-compass-rose" ref={compassRoseRef} aria-hidden="true">
        <span className="office-minimap-north">N</span>
        <span className="office-minimap-east">E</span>
        <span className="office-minimap-south">S</span>
        <span className="office-minimap-west">W</span>
      </div>
      <span className="office-minimap-player" aria-hidden="true" />
    </div>
  );
}
