import { generateCampusMap, type CampusMapGeneratorInputs, type GeneratedCampusMap } from "./campusMapGenerator.js";
import { appendCampusStarterProps } from "./campusFurnishingPlacement.js";
import { MAX_OFFICE_PROPS } from "./officePropLimits.js";

export type CampusInteriorPreset = "furnished" | "empty";
const PROP_LIMIT_LABEL = "This campus exceeds the office prop limit. Choose fewer people or teams.";

/** New-office composition only. Existing saved offices and editor regeneration keep their own props. */
export function createCampusOfficeDraft(inputs: CampusMapGeneratorInputs, interiors: CampusInteriorPreset): GeneratedCampusMap {
  const generated = generateCampusMap(inputs);
  if (generated.layout.props.length > MAX_OFFICE_PROPS) throw new Error(PROP_LIMIT_LABEL);
  if (interiors === "empty") {
    const restroomStarterPrefixes = generated.layout.zones
      .filter((zone) => zone.kind === "restroom")
      .map((zone) => `${zone.id}-starter-`);
    return {
      ...generated,
      layout: {
        ...generated.layout,
        props: generated.layout.props.filter((prop) => !restroomStarterPrefixes.some((prefix) => prop.id.startsWith(prefix))),
      },
    };
  }
  return { ...generated, layout: { ...generated.layout, props: appendCampusStarterProps(generated.layout) } };
}
