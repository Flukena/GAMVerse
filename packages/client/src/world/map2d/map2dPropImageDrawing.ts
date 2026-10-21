import { fitPropIconRect } from "./map2dStaticDetail";

export function drawMap2dPropImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  widthPx: number,
  depthPx: number,
): void {
  const icon = fitPropIconRect(image.naturalWidth, image.naturalHeight, widthPx, depthPx);
  ctx.drawImage(image, icon.x, icon.y, icon.width, icon.height);
}
