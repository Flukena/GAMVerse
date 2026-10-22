import assert from "node:assert/strict";
import test from "node:test";
import { officeActivityLocation, type OfficeActivity } from "./officeActivityPresentation";

function activityAt(locationName: string | null): OfficeActivity {
  return { id: "activity", actorUsername: "actor", activityType: "vehicle.enter", locationName, occurredAt: "2026-10-22T00:00:00Z" };
}

test("activity locations hide missing names and opaque location identifiers", () => {
  for (const location of [null, "", "01234567-89ab-cdef-0123-456789abcdef", "ABCDEF01-2345-6789-ABCD-EF0123456789"]) {
    assert.equal(officeActivityLocation(activityAt(location)), "");
  }
});

test("human location names preserve punctuation, case and embedded vehicle words", () => {
  for (const location of ["Engineering-East", "Meeting Room A", "Supercar-showroom", "My car-taxi zone"]) {
    assert.equal(officeActivityLocation(activityAt(location)), location);
  }
});

test("parked campus vehicles lose their generated prefixes and gain readable names", () => {
  assert.equal(officeActivityLocation(activityAt("campus-car-vehicle-monster-truck")), "Monster Truck");
  assert.equal(officeActivityLocation(activityAt("campus-car-car-taxi")), "Taxi");
  assert.equal(officeActivityLocation(activityAt("campus-car-hatchback-sports")), "Hatchback Sports");
});

test("direct vehicle IDs use the same readable naming without a campus prefix", () => {
  assert.equal(officeActivityLocation(activityAt("vehicle-speedster")), "Speedster");
  assert.equal(officeActivityLocation(activityAt("car-hatchback-sports")), "Hatchback Sports");
});
