import { useEffect, useRef, type MutableRefObject } from "react";
import { CAMPUS_WORLD, type RoomLayout } from "@gammyverse/shared";
import { minimapCanvasPoint } from "./minimapGeometry";
import { Map2dStaticLayer } from "../world/map2d/map2dStaticLayer";
import {
  screenToWorld,
  worldToScreen,
  fitMap2dProjection,
  type Map2dPoint,
  type Map2dProjection,
} from "../world/map2d/map2dProjection";
const MINIMAP_LEFT_OFFSET_PX = 12;
const MINIMAP_BOTTOM_OFFSET_PX = 12;
const MINIMAP_Z_INDEX = 5;
const MINIMAP_BORDER_RADIUS_PX = 8;
const MINIMAP_BORDER_CSS = "1px solid #23495a";
const MINIMAP_PLAYER_COLOR_CSS = "#159bb4";
const MINIMAP_WIDTH_PX = 180;
const MINIMAP_HEIGHT_PX = 140;
const MINIMAP_DOT_RADIUS_PX = 3;
const MINIMAP_REFRESH_INTERVAL_MS = 100;
const MINIMAP_FULL_CIRCLE_RAD = Math.PI * 2;
type Props = {
  layout: RoomLayout | null;
  configVersion: number;
  playersRef: MutableRefObject<Map<string, Map2dPoint>>;
  firstPersonViewRef: MutableRefObject<boolean>;
  hidden: boolean;
  onPan: (point: Map2dPoint) => void;
};
export function minimapProjection(
  widthM: number,
  depthM: number,
): Map2dProjection {
  return fitMap2dProjection(
    widthM,
    depthM,
    MINIMAP_WIDTH_PX,
    MINIMAP_HEIGHT_PX,
  );
}
export function Minimap({
  layout,
  configVersion,
  playersRef,
  firstPersonViewRef,
  hidden,
  onPan,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
      canvas.style.display =
        hidden || firstPersonViewRef.current ? "none" : "block";
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, MINIMAP_WIDTH_PX, MINIMAP_HEIGHT_PX);
      layer.blit(ctx, projection);
      for (const player of playersRef.current.values()) {
        const point = worldToScreen(projection, player);
        ctx.beginPath();
        ctx.arc(
          point.x,
          point.y,
          MINIMAP_DOT_RADIUS_PX,
          0,
          MINIMAP_FULL_CIRCLE_RAD,
        );
        ctx.fillStyle = MINIMAP_PLAYER_COLOR_CSS;
        ctx.fill();
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
    firstPersonViewRef,
    hidden,
    dimensions.width,
    dimensions.depth,
    projection.pxPerM,
  ]);
  return (
    <canvas
      ref={canvasRef}
      className="office-minimap"
      width={MINIMAP_WIDTH_PX}
      height={MINIMAP_HEIGHT_PX}
      aria-label="Office minimap; click to pan 2D"
      style={{
        position: "absolute",
        left: MINIMAP_LEFT_OFFSET_PX,
        bottom: MINIMAP_BOTTOM_OFFSET_PX,
        zIndex: MINIMAP_Z_INDEX,
        border: MINIMAP_BORDER_CSS,
        borderRadius: MINIMAP_BORDER_RADIUS_PX,
      }}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        onPan(
          screenToWorld(projection, minimapCanvasPoint(
            { x: event.clientX - rect.left, y: event.clientY - rect.top },
            rect,
            { width: MINIMAP_WIDTH_PX, height: MINIMAP_HEIGHT_PX },
          )),
        );
      }}
    />
  );
}
