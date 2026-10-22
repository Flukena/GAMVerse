import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const client = path.join(root, "packages/client");
const shared = path.join(root, "packages/shared/src");
const incoming = path.join(client, "assets/incoming/park-sets");
const runtime = path.join(client, "public/assets/external/nature");
const output = path.join(shared, "natureRoomProps.ts");
const packs = [
  { id: "kenney-nature-kit", title: "Kenney Nature Kit", license: "source/License.txt", format: "glb", models: "source/Models/GLTF format" },
  { id: "kaykit-forest-nature", title: "KayKit Forest Nature", license: "source/KayKit_Forest_Nature_Pack_1.0_FREE/License.txt", format: "gltf", models: "source/KayKit_Forest_Nature_Pack_1.0_FREE/Assets" },
  { id: "quaternius-stylized-nature-megakit", title: "Quaternius Stylized Nature MegaKit", license: "source/License_Standard.txt", format: "gltf", models: "source" },
  { id: "riclmbr-low-poly-trees", title: "Low Poly Trees", license: "source/LowPolyTreesPack/LICENSE.txt", format: "obj", models: "source/LowPolyTreesPack/OBJ" },
];

async function filesUnder(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await filesUnder(file));
    else output.push(file);
  }
  return output;
}

function modelBounds(json) {
  const positions = [];
  for (const mesh of json.meshes ?? []) for (const primitive of mesh.primitives ?? []) {
    const accessor = json.accessors?.[primitive.attributes?.POSITION];
    if (accessor?.min?.length === 3 && accessor?.max?.length === 3) positions.push(accessor);
  }
  if (!positions.length) return [0.7, 0.7, 0.7];
  const min = [0, 1, 2].map((axis) => Math.min(...positions.map((a) => a.min[axis])));
  const max = [0, 1, 2].map((axis) => Math.max(...positions.map((a) => a.max[axis])));
  const size = max.map((value, axis) => Math.abs(value - min[axis]));
  return size.map((value) => Number.isFinite(value) && value > 0.001 ? value : 0.7);
}

async function gltfJson(file) {
  if (file.endsWith(".glb")) {
    const bytes = await readFile(file);
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const length = bytes.readUInt32LE(offset);
      const type = bytes.readUInt32LE(offset + 4);
      offset += 8;
      if (type === 0x4e4f534a) return JSON.parse(bytes.toString("utf8", offset, offset + length).replace(/[\0\s]+$/g, ""));
      offset += length;
    }
    throw new Error(`GLB has no JSON chunk: ${file}`);
  }
  return JSON.parse(await readFile(file, "utf8"));
}

async function copyGltfWithDependencies(file, sourceDir, destinationDir) {
  const json = await gltfJson(file);
  const relative = path.relative(sourceDir, file);
  const destination = path.join(destinationDir, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(file, destination);
  if (file.endsWith(".gltf")) {
    for (const uri of [...(json.buffers ?? []), ...(json.images ?? [])].map((entry) => entry.uri).filter((uri) => uri && !uri.startsWith("data:"))) {
      const dependency = path.resolve(path.dirname(file), decodeURIComponent(uri));
      if (!dependency.startsWith(`${sourceDir}${path.sep}`)) throw new Error(`Asset dependency escapes source pack: ${uri}`);
      const dependencyTarget = path.join(destinationDir, path.relative(sourceDir, dependency));
      await mkdir(path.dirname(dependencyTarget), { recursive: true });
      await copyFile(dependency, dependencyTarget);
    }
  }
  return { relative: relative.replaceAll("\\", "/"), bounds: modelBounds(json), extension: path.extname(file).toLowerCase() };
}

function objBounds(contents) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const line of contents.split(/\r?\n/)) {
    if (!line.startsWith("v ")) continue;
    const point = line.trim().split(/\s+/).slice(1, 4).map(Number);
    if (point.length !== 3 || point.some((value) => !Number.isFinite(value))) continue;
    for (let axis = 0; axis < 3; axis++) { min[axis] = Math.min(min[axis], point[axis]); max[axis] = Math.max(max[axis], point[axis]); }
  }
  return min.map((value, axis) => Number.isFinite(value) ? Math.max(0.01, max[axis] - value) : 0.7);
}

function readableName(filename) {
  return path.basename(filename, path.extname(filename)).replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const definitions = [];
for (const pack of packs) {
  const sourceDir = path.resolve(incoming, pack.id, pack.models);
  const packRoot = path.resolve(incoming, pack.id);
  const runtimePack = path.join(runtime, pack.id);
  const licenseFile = path.join(packRoot, pack.license);
  await mkdir(runtimePack, { recursive: true });
  await copyFile(licenseFile, path.join(runtimePack, "LICENSE.txt"));

  const allFiles = await filesUnder(sourceDir);
  const extension = pack.format === "glb" ? ".glb" : pack.format === "gltf" ? ".gltf" : ".obj";
  for (const file of allFiles.filter((candidate) => path.extname(candidate).toLowerCase() === extension)) {
    const basename = path.basename(file, extension);
    const label = `${readableName(basename)} (${pack.title})`;
    let relative;
    let bounds;
    let modelUrl;
    let materialUrl;
    if (pack.format === "obj") {
      const mtlFile = path.join(path.dirname(file), `${basename}.mtl`);
      const obj = await readFile(file, "utf8");
      const mtl = await readFile(mtlFile, "utf8");
      const dependencies = [...mtl.matchAll(/^\s*(?:map_\w+|bump|disp|decal)\s+(?:-\w+\s+\S+\s+)?(.+)$/gim)].map((match) => match[1].trim().replace(/^"|"$/g, ""));
      const destinations = [file, mtlFile, ...dependencies.map((item) => path.resolve(path.dirname(mtlFile), item))];
      for (const source of destinations) {
        const dest = path.join(runtimePack, path.relative(sourceDir, source));
        await mkdir(path.dirname(dest), { recursive: true });
        await copyFile(source, dest);
      }
      relative = path.relative(sourceDir, file).replaceAll("\\", "/");
      bounds = objBounds(obj);
      modelUrl = `/assets/external/nature/${pack.id}/${relative}`;
      materialUrl = modelUrl.replace(/\.obj$/i, ".mtl");
    } else {
      const copied = await copyGltfWithDependencies(file, sourceDir, runtimePack);
      relative = copied.relative;
      bounds = copied.bounds;
      modelUrl = `/assets/external/nature/${pack.id}/${relative}`;
    }

    const [width, height, depth] = bounds;
    const floorObject = Math.max(width, depth) > 0.24;
    definitions.push({
      asset: `nature-${pack.id}-${basename.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      label,
      height,
      width,
      depth,
      collision: floorObject,
      ...(floorObject ? { collisionWidth: width, collisionDepth: depth } : {}),
      ...(materialUrl ? { materialUrl } : {}),
      modelUrl,
      format: pack.format === "obj" ? undefined : "gltf",
      group: `Nature · ${pack.title}`,
    });
  }
}

await writeFile(output, `// Generated by packages/client/scripts/prepare-nature-assets.mjs from the licensed incoming packs.\nimport type { RoomPropDefinition } from "./roomPropTypes.js";\n\nexport const NATURE_ROOM_PROP_CATALOG: ReadonlyArray<RoomPropDefinition> = ${JSON.stringify(definitions, null, 2)};\n`);
console.log(`Prepared ${definitions.length} nature props from ${packs.length} licensed packs.`);
