import { useEffect, useMemo, useState } from "react";
import { ROOM_PROP_CATALOG, type RoomLayoutProp } from "@gammyverse/shared";
import { preloadRoomPropAsset } from "../assets/loaders";
import { roomPropAssetPaths } from "../assets/roomPropPaths";
import "./ModifyPropsEditor.css";

export type ModifyPropsCatalogItem = (typeof ROOM_PROP_CATALOG)[number];
let catalogAssetPreloadTimer: ReturnType<typeof setTimeout> | undefined;
function preloadCatalogAsset(item: ModifyPropsCatalogItem) {
  if (item.geometry || item.vehicleId) return;
  void preloadRoomPropAsset(roomPropAssetPaths(item)).catch((error: unknown) => {
    console.warn(`Could not preload prop ${item.asset}.`, error);
  });
}
function scheduleCatalogAssetPreload(item: ModifyPropsCatalogItem) {
  if (catalogAssetPreloadTimer) clearTimeout(catalogAssetPreloadTimer);
  catalogAssetPreloadTimer = setTimeout(() => preloadCatalogAsset(item), 160);
}

export type ModifyPropsEditorProps = {
  open: boolean;
  officeName?: string;
  dimension: { width: number; depth: number; gridSize?: number };
  props: RoomLayoutProp[];
  catalog?: readonly ModifyPropsCatalogItem[];
  selectedPropId?: string | null;
  placingAsset?: string | null;
  error?: string | null;
  onDraftChange?: (props: RoomLayoutProp[]) => void;
  onRequestPlacement?: (asset: string | null) => void;
  onSelectProp?: (propId: string | null) => void;
  onRotateProp?: (propId: string) => void;
  onSave: (props: RoomLayoutProp[]) => void | Promise<void>;
  onCancel: () => void;
};

/** The real 3D map remains the editing surface; this panel only lists props. */
export function ModifyPropsEditor({ open, officeName, dimension, props, catalog = ROOM_PROP_CATALOG, selectedPropId, placingAsset, error, onDraftChange, onRequestPlacement, onSelectProp, onRotateProp, onSave, onCancel }: ModifyPropsEditorProps) {
  const [draft, setDraft] = useState<RoomLayoutProp[]>(props);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All props");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(props);
    setQuery("");
    setCategory("All props");
  }, [open]);
  useEffect(() => { if (open) onDraftChange?.(draft); }, [draft, onDraftChange, open]);
  useEffect(() => { if (open) setDraft(props); }, [open, props]);

  const semanticCategories = ["Floor tiles", "Small items", "Tables & surfaces", "Shelves", "Seats"];
  const categories = useMemo(() => ["All props", ...semanticCategories, ...Array.from(new Set(catalog.map((item) => item.group ?? "Furniture"))).filter((group) => !semanticCategories.includes(group)).sort()], [catalog]);
  const filteredCatalog = useMemo(() => catalog.filter((item) => {
    const semanticMatch = category === "Floor tiles" ? item.group === "Floor tiles"
      : category === "Small items" ? item.placementClass === "small"
      : category === "Tables & surfaces" ? item.placementClass === "surface"
      : category === "Shelves" ? item.placementClass === "shelf"
      : category === "Seats" ? item.placementClass === "seat"
      : category === "All props" || (item.group ?? "Furniture") === category;
    return semanticMatch && item.label.toLowerCase().includes(query.trim().toLowerCase());
  }), [catalog, category, query]);

  if (!open) return null;
  const save = async () => {
    setSaving(true);
    try { await onSave(draft); } catch { /* The parent displays the save error. */ } finally { setSaving(false); }
  };
  const selectedDefinition = selectedPropId ? catalog.find((item) => item.asset === draft.find((prop) => prop.id === selectedPropId)?.asset) : undefined;

  return <div className="modify-props-backdrop" role="presentation">
    <section className="modify-props-editor" role="dialog" aria-modal="true" aria-labelledby="modify-props-title">
      <header className="modify-props-header">
        <div><span className="modify-props-eyebrow">OFFICE PROPS · {dimension.width} × {dimension.depth} m</span><h2 id="modify-props-title">Modify props</h2><p>{officeName ? `${officeName} · ` : ""}Draft changes stay private until saved.</p></div>
        <button className="modify-props-icon-button" aria-label="Close editor" onClick={onCancel}>×</button>
      </header>
      <div className="modify-props-body">
        <aside className="modify-props-library">
          <div className="modify-props-library-heading"><strong>Props list</strong><span>{draft.length} placed · {filteredCatalog.length} items</span></div>
          <input aria-label="Search props" className="modify-props-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search props" />
          <div className="modify-props-categories" aria-label="Prop categories">{categories.map((item) => <button type="button" key={item} className={category === item ? "is-active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>
          <p className="modify-props-list-hint">Choose a prop, then click the real map to place it. Floor tiles stay selected so you can lay several tiles in a row.</p>
          <section className="modify-props-action-help" aria-label="How to move or rotate props">
            <strong>Move or rotate a placed prop</strong>
            <span>Click a placed prop to show its action buttons. Click <b>Move</b>, then left-drag on the map to move it.</span>
            <span>Click <b>Rotate</b> in that prop’s action buttons to turn it 90°.</span>
          </section>
          {selectedDefinition && <div className="modify-props-selected-hint"><span>Selected on map: <strong>{selectedDefinition.label}</strong></span>{onRotateProp && <button type="button" onClick={() => onRotateProp(selectedPropId!)}>Rotate 90°</button>}</div>}
          <div className="modify-props-catalog">{filteredCatalog.map((item) => <button type="button" key={item.asset} aria-label={item.label} title={item.label} className={`modify-props-catalog-card ${placingAsset === item.asset ? "is-selected" : ""}`} onMouseEnter={() => scheduleCatalogAssetPreload(item)} onFocus={() => preloadCatalogAsset(item)} onClick={() => { if (!item.geometry && !item.vehicleId) void preloadRoomPropAsset(roomPropAssetPaths(item)).catch(() => undefined); onSelectProp?.(null); onRequestPlacement?.(item.asset); }}>
            <span className="modify-props-thumb">{item.preview && !isPackPreview(item.preview) ? <img src={item.preview} alt="" loading="lazy" /> : <span aria-hidden="true">▧</span>}</span>
          </button>)}</div>
        </aside>
      </div>
      <footer className="modify-props-footer"><span role={error ? "alert" : undefined} className={error ? "modify-props-error" : ""}>{error ?? "Changes are local until saved."}</span><div><button className="modify-props-secondary" onClick={onCancel} disabled={saving}>Cancel</button><button className="modify-props-primary" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save props"}</button></div></footer>
    </section>
  </div>;
}

function isPackPreview(preview: string) { return /\/Preview(?:_AllModels)?\.(?:jpg|png|webp)$/i.test(preview); }
