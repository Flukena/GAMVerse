import { Map2dRenderer, type Map2dFrame, type Map2dListener } from "./Map2dRenderer";

/** Keep the office usable in 2D when the browser refuses a WebGL context. */
export function mountMap2dWithoutWebgl(
  host: HTMLElement,
  listener: Map2dListener,
  frame: (nowMs: number, deltaS: number) => Map2dFrame,
  onCenter: (center: { x: number; z: number }) => void,
): () => void {
  const canvas = document.createElement("canvas");
  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  host.appendChild(canvas);
  const renderer = new Map2dRenderer(canvas, listener);
  let animationFrame = 0;
  let previousFrame = performance.now();
  const draw = (nowMs: number) => {
    const state = frame(nowMs, Math.min((nowMs - previousFrame) / 1000, 0.05));
    onCenter(renderer.frame(state) ?? state.projection.center);
    previousFrame = nowMs;
    animationFrame = requestAnimationFrame(draw);
  };
  animationFrame = requestAnimationFrame(draw);
  return () => {
    cancelAnimationFrame(animationFrame);
    renderer.dispose();
    canvas.remove();
  };
}
