import LiquidGlass, { type LiquidGlassOptions } from "liquid-glass-js";

const GLASS_PREVIEW_WIDTH_PX = 160;
const GLASS_PREVIEW_HEIGHT_PX = 58;

export interface GlassPreviewInstance {
  elements: readonly Node[];
  moveTo(x: number, y: number): unknown;
  destroy(): void;
}

export type GlassPreviewFactory = (options: LiquidGlassOptions) => GlassPreviewInstance;

const createGlassPreview: GlassPreviewFactory = (options) => {
  const glass = new LiquidGlass(options);
  const glassElements = glass as unknown as { svg: SVGSVGElement; lensEl: HTMLDivElement; glassEl: HTMLDivElement };
  return {
    elements: [glassElements.svg, glassElements.lensEl, glassElements.glassEl],
    moveTo: (x, y) => glass.moveTo(x, y),
    destroy: () => glass.destroy(),
  };
};

export function mountLiquidGlassPreview(
  target: HTMLElement,
  background: HTMLElement,
  createGlass: GlassPreviewFactory = createGlassPreview,
): () => void {
  const dialog = target.closest("dialog");
  const parent = dialog ?? document.body;
  const positionGlass = () => {
    const bounds = target.getBoundingClientRect();
    createGlassInstance.moveTo(
      bounds.left + (bounds.width - GLASS_PREVIEW_WIDTH_PX) / 2,
      bounds.top + (bounds.height - GLASS_PREVIEW_HEIGHT_PX) / 2,
    );
  };
  const bounds = target.getBoundingClientRect();
  const createGlassInstance = createGlass({
    background,
    width: GLASS_PREVIEW_WIDTH_PX,
    height: GLASS_PREVIEW_HEIGHT_PX,
    radius: 18,
    scale: 12,
    depth: 18,
    chroma: 0.015,
    blur: 0,
    glow: 0.1,
    edge: 0.4,
    tint: 0.12,
    tintColor: "#ffffff",
    draggable: false,
    zIndex: 1,
    x: bounds.left + (bounds.width - GLASS_PREVIEW_WIDTH_PX) / 2,
    y: bounds.top + (bounds.height - GLASS_PREVIEW_HEIGHT_PX) / 2,
  });
  positionGlass();
  parent.append(...createGlassInstance.elements);

  const resizeObserver = new ResizeObserver(positionGlass);
  resizeObserver.observe(target);
  window.addEventListener("scroll", positionGlass, true);
  window.addEventListener("resize", positionGlass);

  return () => {
    resizeObserver.disconnect();
    window.removeEventListener("scroll", positionGlass, true);
    window.removeEventListener("resize", positionGlass);
    createGlassInstance.destroy();
  };
}