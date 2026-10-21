import { ShaderGradient, ShaderGradientCanvas } from "@shader-gradient/react";

export function ShaderGradientMaterialPreview() {
  return <ShaderGradientCanvas className="surface-preview-shader" pixelDensity={0.75} fov={45}
    pointerEvents="none" lazyLoad={false} powerPreference="low-power">
    <ShaderGradient preset="pensive" type="sphere" shader="defaults" />
  </ShaderGradientCanvas>;
}