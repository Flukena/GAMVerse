import { avatarSpriteScale } from "./avatarSpriteGeometry";

export const NAME_PILL_HEIGHT_PADDING_PX = 6;
const NAME_PILL_GAP_PX = 10;
// Kenney 64px previews place the head in this upper central rectangle.
const HEAD_CROP_LEFT_RATIO = 13 / 64;
const HEAD_CROP_TOP_RATIO = 9 / 64;
const HEAD_CROP_WIDTH_RATIO = 38 / 64;
const HEAD_CROP_HEIGHT_RATIO = 26 / 64;

const AVATAR_MARKER_RADIUS_PX = 15;
const AVATAR_NAME_FONT_PX = 11;

export function map2dHeadRadiusPx(pxPerM: number): number {
  return AVATAR_MARKER_RADIUS_PX * avatarSpriteScale(pxPerM);
}
export function map2dNameFontPx(_pxPerM: number): number {
  return AVATAR_NAME_FONT_PX;
}
export function portraitCropRect(widthPx: number, heightPx: number) {
  return {
    x: widthPx * HEAD_CROP_LEFT_RATIO,
    y: heightPx * HEAD_CROP_TOP_RATIO,
    width: widthPx * HEAD_CROP_WIDTH_RATIO,
    height: heightPx * HEAD_CROP_HEIGHT_RATIO,
  };
}

export function map2dNamePillTopPx(centerYPx: number, aboveAnchorPx: number, fontPx: number): number {
  return centerYPx - aboveAnchorPx - NAME_PILL_GAP_PX - fontPx - NAME_PILL_HEIGHT_PADDING_PX;
}
