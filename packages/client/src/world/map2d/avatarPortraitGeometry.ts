const HEAD_MIN_RADIUS_PX = 14;
const HEAD_MAX_RADIUS_PX = 16;
const HEAD_BASE_RADIUS_PX = 15;
const PORTRAIT_REFERENCE_SCALE_PX_PER_M = 12;
const HEAD_GROWTH_PX_PER_SCALE_UNIT = 0.1;
const NAME_MIN_FONT_PX = 10;
const NAME_MAX_FONT_PX = 13;
const NAME_BASE_FONT_PX = 11;
const NAME_GROWTH_PX_PER_SCALE_UNIT = 0.1;
export const NAME_PILL_HEIGHT_PADDING_PX = 6;
const NAME_PILL_GAP_PX = 10;
// Kenney 64px previews place the head in this upper central rectangle.
const HEAD_CROP_LEFT_RATIO = 13 / 64;
const HEAD_CROP_TOP_RATIO = 9 / 64;
const HEAD_CROP_WIDTH_RATIO = 38 / 64;
const HEAD_CROP_HEIGHT_RATIO = 26 / 64;

export function map2dHeadRadiusPx(pxPerM: number): number {
  return Math.max(HEAD_MIN_RADIUS_PX, Math.min(HEAD_MAX_RADIUS_PX,
    HEAD_BASE_RADIUS_PX + (pxPerM - PORTRAIT_REFERENCE_SCALE_PX_PER_M) * HEAD_GROWTH_PX_PER_SCALE_UNIT));
}
export function map2dNameFontPx(pxPerM: number): number {
  return Math.max(NAME_MIN_FONT_PX, Math.min(NAME_MAX_FONT_PX,
    NAME_BASE_FONT_PX + (pxPerM - PORTRAIT_REFERENCE_SCALE_PX_PER_M) * NAME_GROWTH_PX_PER_SCALE_UNIT));
}
export function portraitCropRect(widthPx: number, heightPx: number) {
  return {
    x: widthPx * HEAD_CROP_LEFT_RATIO,
    y: heightPx * HEAD_CROP_TOP_RATIO,
    width: widthPx * HEAD_CROP_WIDTH_RATIO,
    height: heightPx * HEAD_CROP_HEIGHT_RATIO,
  };
}

export function map2dNamePillTopPx(centerYPx: number, radiusPx: number, fontPx: number): number {
  return centerYPx - radiusPx - NAME_PILL_GAP_PX - fontPx - NAME_PILL_HEIGHT_PADDING_PX;
}
