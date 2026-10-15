import * as THREE from "three";

export type WorldDestination = { x: number; z: number };

/** A screen-facing light beam pinned to a world-space travel destination. */
export function createWorldDestinationBeacon(host: HTMLElement) {
  const root = document.createElement("div");
  root.className = "world-destination-beacon";
  root.setAttribute("role", "img");
  root.setAttribute("aria-label", "Selected travel destination");
  Object.assign(root.style, {
    position: "fixed",
    zIndex: "25",
    display: "none",
    width: "22px",
    height: "68px",
    pointerEvents: "none",
    transform: "translate(-50%, -100%)",
    filter: "drop-shadow(0 2px 5px rgba(20, 35, 40, .55))",
  } satisfies Partial<CSSStyleDeclaration>);

  const beam = document.createElement("span");
  Object.assign(beam.style, {
    position: "absolute",
    left: "9px",
    bottom: "12px",
    width: "4px",
    height: "50px",
    borderRadius: "4px",
    background: "linear-gradient(to top, rgba(239, 71, 111, .32), #ef476f)",
  } satisfies Partial<CSSStyleDeclaration>);
  const point = document.createElement("span");
  Object.assign(point.style, {
    position: "absolute",
    left: "2px",
    bottom: "1px",
    width: "18px",
    height: "18px",
    boxSizing: "border-box",
    border: "3px solid #fff",
    borderRadius: "50%",
    background: "#ef476f",
    boxShadow: "0 0 0 3px rgba(239, 71, 111, .3)",
  } satisfies Partial<CSSStyleDeclaration>);
  root.append(beam, point);
  document.body.appendChild(root);

  const target = new THREE.Vector3();
  let hasTarget = false;

  return {
    setTarget(position: WorldDestination, screenPosition: { x: number; y: number }) {
      target.set(position.x, 0.06, position.z);
      hasTarget = true;
      root.style.left = `${screenPosition.x}px`;
      root.style.top = `${screenPosition.y}px`;
      root.style.display = "block";
    },
    clearTarget() {
      hasTarget = false;
      root.style.display = "none";
    },
    render(camera: THREE.Camera, visible: boolean) {
      if (!hasTarget || !visible || host.clientWidth <= 0 || host.clientHeight <= 0) {
        root.style.display = "none";
        return;
      }
      camera.updateMatrixWorld();
      const projected = target.clone().project(camera);
      const offscreen = projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1;
      if (projected.z < -1) { projected.x *= -1; projected.y *= -1; }
      // Keep an edge indicator when following the character puts the target
      // outside the camera view. The clicked point should never disappear.
      projected.x = THREE.MathUtils.clamp(projected.x, -0.9, 0.9);
      projected.y = THREE.MathUtils.clamp(projected.y, -0.9, 0.9);
      const bounds = host.getBoundingClientRect();
      root.style.display = "block";
      root.style.opacity = offscreen ? "0.72" : "1";
      root.style.left = `${bounds.left + (projected.x * 0.5 + 0.5) * bounds.width}px`;
      root.style.top = `${bounds.top + (-projected.y * 0.5 + 0.5) * bounds.height}px`;
    },
    dispose() {
      root.remove();
    },
  };
}
