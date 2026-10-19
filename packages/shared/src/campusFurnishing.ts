import { generateCampusMap, type CampusMapGeneratorInputs, type GeneratedCampusMap } from "./campusMapGenerator.js";
import { appendCampusStarterProps } from "./campusFurnishingPlacement.js";
import { MAX_OFFICE_PROPS } from "./officePropLimits.js";

export type CampusInteriorPreset = "furnished" | "empty";
const PROP_LIMIT_LABEL = "This campus exceeds the office prop limit. Choose fewer people or teams.";

/** New-office composition only. Existing saved offices and editor regeneration keep their own props. */
export function createCampusOfficeDraft(inputs: CampusMapGeneratorInputs, interiors: CampusInteriorPreset): GeneratedCampusMap {
  const generated = generateCampusMap(inputs);
  if (generated.layout.props.length > MAX_OFFICE_PROPS) throw new Error(PROP_LIMIT_LABEL);
  if (interiors === "empty") return generated;
  return { ...generated, layout: { ...generated.layout, props: appendCampusStarterProps(generated.layout) } };
}
