import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { mountLiquidGlassPreview } from "./liquidGlassPreview";
import { SurfaceRendererBoundary, SurfaceRendererFallback } from "./SurfaceRendererBoundary";
import "./SurfaceMaterialPreview.css";

type SurfaceMode = "fiber" | "shader" | "glass";

const FiberMaterialPreview = lazy(() => import("./FiberMaterialPreview").then(({ FiberMaterialPreview: Preview }) => ({ default: Preview })));
const ShaderGradientMaterialPreview = lazy(() => import("./ShaderGradientMaterialPreview").then(({ ShaderGradientMaterialPreview: Preview }) => ({ default: Preview })));

const SURFACE_MODES: readonly { id: SurfaceMode; label: string }[] = [
  { id: "fiber", label: "Fiber" },
  { id: "shader", label: "Shader" },
  { id: "glass", label: "Glass" },
];

function useMaterialPreferences() {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [reducedTransparency, setReducedTransparency] = useState(false);

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const transparencyQuery = window.matchMedia("(prefers-reduced-transparency: reduce)");
    const update = () => {
      setReducedMotion(motionQuery.matches);
      setReducedTransparency(transparencyQuery.matches);
    };
    update();
    motionQuery.addEventListener("change", update);
    transparencyQuery.addEventListener("change", update);
    return () => {
      motionQuery.removeEventListener("change", update);
      transparencyQuery.removeEventListener("change", update);
    };
  }, []);

  return { reducedMotion, reducedTransparency };
}

function LiquidGlassSample({ reducedTransparency }: { reducedTransparency: boolean }) {
  const sampleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sample = sampleRef.current;
    const supportsGlass = CSS.supports("backdrop-filter", "blur(1px)")
      || CSS.supports("-webkit-backdrop-filter", "blur(1px)");
    if (!sample || reducedTransparency || !supportsGlass) return;
    return mountLiquidGlassPreview(sample, sample);
  }, [reducedTransparency]);

  return <div className="surface-preview-glass" ref={sampleRef}>
    <span className="surface-preview-grid" aria-hidden="true" />
    <span className="surface-preview-glass-label">Light through glass</span>
  </div>;
}

export function SurfaceMaterialPreview() {
  const [mode, setMode] = useState<SurfaceMode>("glass");
  const { reducedMotion, reducedTransparency } = useMaterialPreferences();

  return <section className="surface-material-preview" aria-labelledby="surface-preview-title">
    <div className="surface-preview-heading">
      <h4 id="surface-preview-title">Material study</h4>
      <div className="surface-preview-tabs" role="group" aria-label="Material renderer">
        {SURFACE_MODES.map((item) => <button key={item.id} id={`surface-tab-${item.id}`} type="button"
          aria-pressed={mode === item.id} aria-controls="surface-preview-stage"
          onClick={() => setMode(item.id)}>{item.label}</button>)}
      </div>
    </div>
    <div className="surface-preview-stage" id="surface-preview-stage" aria-label={`${mode} material preview`}>
      {mode === "fiber" && <SurfaceRendererBoundary>{({ retry }) => <Suspense fallback={<div className="surface-preview-static" aria-hidden="true" />}>
        <FiberMaterialPreview fallback={<SurfaceRendererFallback onRetry={retry} />} />
      </Suspense>}</SurfaceRendererBoundary>}
      {mode === "shader" && (reducedMotion
        ? <div className="surface-preview-static" aria-label="Static shader preview; animation reduced by system preference" />
        : <SurfaceRendererBoundary>{() => <Suspense fallback={<div className="surface-preview-static" aria-hidden="true" />}>
          <ShaderGradientMaterialPreview />
        </Suspense>}</SurfaceRendererBoundary>)}
      {mode === "glass" && <LiquidGlassSample reducedTransparency={reducedTransparency} />}
    </div>
    <p className="surface-preview-caption" aria-live="polite">
      {mode === "fiber" && "Static 3D material, rendered only while selected."}
      {mode === "shader" && (reducedMotion ? "Animation reduced by system preference." : "Animated shader, rendered only while selected.")}
      {mode === "glass" && (reducedTransparency ? "Opaque preview follows reduced-transparency preference." : "Refraction samples this still preview, not the live office." )}
    </p>
  </section>;
}