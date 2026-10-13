LOW POLY TREES PACK
==================

26 stylized low poly trees and nature props - oak, pine, birch, palm, willow, cherry blossom, maple, baobab, fruit trees, bonsai, stumps, logs and bushes - with hand-painted textures (baked lighting and soft shadows).

CONTENTS
--------
OBJ/      one .obj + .mtl per model, plus the 3 texture atlases
FBX/      one .fbx per model (Unity / Unreal ready), plus the 3 texture atlases
GLB/      trees_pack.glb - all 26 models in a single file, textures embedded (Godot, web, Roblox)
Preview/  cover image

Total: 7215 triangles (average 278 per model).
All models share 3 texture atlases (1024x1024 PNG). Repeated parts (leaf clusters, branches, fronds, fruits) share the same UV space.
Foliage is solid geometry (no alpha cards), so there is no transparency sorting and it works on any platform.
Trees use realistic sizes (a redwood is about 12 m tall, a bonsai about 0.45 m) - scale them freely.

MODELS
------
Model                   Tris   Texture
acacia_tree              208   trees_atlas1.png
apple_tree               274   trees_atlas2.png
banana_tree              426   trees_atlas1.png
baobab_tree              314   trees_atlas1.png
bare_tree                150   trees_atlas3.png
berry_bush               192   trees_atlas2.png
birch_tree               268   trees_atlas1.png
bonsai                   344   trees_atlas3.png
bush                     256   trees_atlas3.png
cherry_blossom           338   trees_atlas2.png
christmas_tree           348   trees_atlas3.png
cypress_tree             112   trees_atlas2.png
fallen_log                87   trees_atlas3.png
joshua_tree              420   trees_atlas1.png
lemon_tree               256   trees_atlas3.png
maple_tree               338   trees_atlas2.png
oak_tree                 338   trees_atlas3.png
palm_tree                388   trees_atlas2.png
pine_tree                216   trees_atlas1.png
poplar_tree              280   trees_atlas2.png
redwood_tree             224   trees_atlas3.png
sapling                  230   trees_atlas2.png
snowy_pine               264   trees_atlas3.png
stump                    218   trees_atlas1.png
topiary_tree             276   trees_atlas2.png
willow_tree              450   trees_atlas1.png

HOW TO USE
----------
- Keep each model in the same folder as its atlas: the .mtl / .fbx files reference the texture by file name.
- Unity: drag the FBX folder into Assets. Scale is 1 unit = 1 meter, no extra rotation needed.
  If the material appears white, assign the matching atlas as Base Map (Albedo).
- Unreal: import the .fbx files and plug the atlas into the Base Color of the material.
- Godot: import GLB/trees_pack.glb (each model is a separate node) or the individual .obj files.
- Blender: File > Import > Wavefront (.obj), FBX or glTF.
- Roblox: import the .obj (or .fbx) as a MeshPart and set its TextureID to the matching atlas,
  so all models share the same 3 textures.
- Keep backface culling ON (default).
- Lighting is painted into the textures, so the models also look good with unlit/simple materials.
- Units: meters. Each model's origin is at its bottom center. The front of every model faces -X in Blender.

LICENSE
-------
CC0 1.0 Universal (Public Domain) - free for personal and commercial use, no credit required.
See LICENSE.txt.
