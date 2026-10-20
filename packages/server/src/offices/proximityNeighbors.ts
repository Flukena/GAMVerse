export const PROXIMITY_EXIT_MARGIN_BLOCKS = 0.5;

type PersonPosition = readonly [string, { readonly x: number; readonly z: number }];

/** Broad phase only: the exact distance and previous-edge hysteresis decide membership.
 * Preserve input/pair order so the room's component walk and identity reuse remain unchanged.
 */
export function proximityNeighbors(
  people: readonly PersonPosition[],
  previous: ReadonlyMap<string, ReadonlySet<string>>,
  joinRadiusBlocks: number,
) {
  const cellSizeBlocks = joinRadiusBlocks + PROXIMITY_EXIT_MARGIN_BLOCKS;
  const buckets = new Map<string, number[]>();
  const cellKey = (x: number, z: number) => `${x},${z}`;
  const neighbors = new Map(people.map(([id]) => [id, new Set<string>()]));
  let candidatePairCount = 0;
  for (let i = 0; i < people.length; i++) {
    const position = people[i]![1];
    const key = cellKey(Math.floor(position.x / cellSizeBlocks), Math.floor(position.z / cellSizeBlocks));
    const bucket = buckets.get(key);
    if (bucket) bucket.push(i); else buckets.set(key, [i]);
  }
  for (let i = 0; i < people.length; i++) {
    const [firstId, first] = people[i]!;
    const cellX = Math.floor(first.x / cellSizeBlocks);
    const cellZ = Math.floor(first.z / cellSizeBlocks);
    const candidates: number[] = [];
    for (let x = cellX - 1; x <= cellX + 1; x++) for (let z = cellZ - 1; z <= cellZ + 1; z++) {
      for (const j of buckets.get(cellKey(x, z)) ?? []) if (j > i) candidates.push(j);
    }
    candidates.sort((a, b) => a - b);
    for (const j of candidates) {
      const [secondId, second] = people[j]!;
      candidatePairCount++;
      const radiusBlocks = joinRadiusBlocks + (previous.get(firstId)?.has(secondId) ? PROXIMITY_EXIT_MARGIN_BLOCKS : 0);
      if (Math.hypot(first.x - second.x, first.z - second.z) <= radiusBlocks) {
        neighbors.get(firstId)!.add(secondId);
        neighbors.get(secondId)!.add(firstId);
      }
    }
  }
  return { neighbors, candidatePairCount, possiblePairCount: people.length * (people.length - 1) / 2 };
}
