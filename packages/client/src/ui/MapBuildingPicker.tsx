import { useMemo, useState } from "react";
import { ROOM_PROP_CATALOG, type RoomLayoutProp } from "@gammyverse/shared";
import { PropThumbnail } from "./PropThumbnail";
import "./MapBuildingPicker.css";

const MAP_COMPONENTS = ROOM_PROP_CATALOG.filter((item) => item.editorRole === "map-component");
const BUILDING_PREFABS = ROOM_PROP_CATALOG.filter((item) => item.editorRole === "building-prefab");
type PickerSection = "Building components" | "Finished buildings";

type Props = {
  props: RoomLayoutProp[];
  selectedAsset: string | null;
  selectedPropId: string | null;
  onSelectAsset: (asset: string | null) => void;
  onSelectProp: (id: string | null) => void;
  onDeleteProp: (id: string) => void;
  onClose: () => void;
};

export function MapBuildingPicker({ props, selectedAsset, selectedPropId, onSelectAsset, onSelectProp, onDeleteProp, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<PickerSection>("Building components");
  const items = section === "Building components" ? MAP_COMPONENTS : BUILDING_PREFABS;
  const filteredItems = useMemo(() => items.filter((item) => `${item.label} ${item.asset}`.toLowerCase().includes(query.trim().toLowerCase())), [items, query]);
  const placedItems = props.filter((prop) => items.some((item) => item.asset === prop.asset));

  return <section className="map-building-picker" aria-label="Map building components">
    <header><div><span className="eyebrow">MAP EDITOR</span><strong>{section}</strong></div><button type="button" className="icon-button" aria-label="Close building picker" onClick={onClose}>×</button></header>
    <div className="map-building-picker-tabs" role="tablist" aria-label="Map component type">
      {(["Building components", "Finished buildings"] as const).map((tab) => <button type="button" role="tab" aria-selected={section === tab} className={section === tab ? "is-active" : ""} key={tab} onClick={() => { setSection(tab); setQuery(""); onSelectAsset(null); onSelectProp(null); }}>{tab}</button>)}
    </div>
    <p>{section === "Building components" ? "Choose road tiles or paths, then click the map to place them. Select a placed piece to move, rotate, or remove it." : "Choose a complete building, then click an open area on the map to place it."}</p>
    <input aria-label={`Search ${section.toLowerCase()}`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={section === "Building components" ? "Search roads and paths" : "Search buildings"} />
    <div className="map-building-picker-grid">{filteredItems.map((item) => <button type="button" key={item.asset} className={selectedAsset === item.asset ? "is-selected" : ""} aria-label={`Place ${item.label}`} title={item.label} onClick={() => { onSelectProp(null); onSelectAsset(item.asset); }}>
      <span><PropThumbnail item={item} preview={item.preview} /></span><strong>{item.label}</strong>
    </button>)}</div>
    {filteredItems.length === 0 && <span className="map-building-picker-empty">No matching {section.toLowerCase()}.</span>}
    <div className="map-building-picker-placed"><strong>Placed {section.toLowerCase()} <small>{placedItems.length}</small></strong>
      {placedItems.length === 0 ? <span className="map-building-picker-empty">Nothing placed yet.</span> : placedItems.map((prop) => {
        const item = items.find((candidate) => candidate.asset === prop.asset)!;
        return <div key={prop.id} className={selectedPropId === prop.id ? "is-selected" : ""}>
          <button type="button" onClick={() => { onSelectAsset(null); onSelectProp(prop.id); }}>{item.label}</button>
          <button type="button" aria-label={`Remove ${item.label}`} title="Remove from map draft" onClick={() => onDeleteProp(prop.id)}>Remove</button>
        </div>;
      })}
      {placedItems.length > 0 && <span className="map-building-picker-hint">Select a piece on the map, then right-click it to move or rotate.</span>}
    </div>
  </section>;
}
