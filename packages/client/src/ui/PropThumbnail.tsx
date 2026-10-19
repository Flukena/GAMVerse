import { useEffect, useState } from "react";
import type { ROOM_PROP_CATALOG } from "@gammyverse/shared";

type CatalogItem = (typeof ROOM_PROP_CATALOG)[number];
type Props = { item: CatalogItem; preview?: string };

function isItemPreview(preview: string | undefined): preview is string {
  return Boolean(preview && !/\/Preview(?:_AllModels)?\.(?:jpg|png|webp)$/i.test(preview));
}

function catalogThumbnailUrl(item: CatalogItem) {
  return `/assets/office-props/catalog-thumbnails/${encodeURIComponent(item.asset)}.png`;
}

/** Catalog cards use saved images so opening the editor never starts a WebGL render. */
export function PropThumbnail({ item, preview }: Props) {
  const itemPreview = isItemPreview(preview) ? preview : null;
  const generatedPreview = catalogThumbnailUrl(item);
  const [source, setSource] = useState(itemPreview ?? generatedPreview);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSource(itemPreview ?? generatedPreview);
    setFailed(false);
  }, [generatedPreview, itemPreview]);

  if (failed) return <span className="modify-props-thumbnail-loading" aria-hidden="true">▧</span>;
  return <img
    src={source}
    alt=""
    loading="lazy"
    onError={() => {
      if (source !== generatedPreview) setSource(generatedPreview);
      else setFailed(true);
    }}
  />;
}
