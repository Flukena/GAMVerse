GOBKIT - Free Monster Pack
==========================

8 game-ready, rigged, low-poly minion variants (.glb).
Each model ships with 3 baked animation clips: Idle / Attack / Dead (24 FPS,
one track: idle 0-29, attack 30-59, dead 60-89).

Files
-----
minion-a01.glb, minion-a02.glb   (A body)
minion-b01.glb, minion-b02.glb   (B body)
minion-c01.glb, minion-c02.glb   (C body)
minion-d01.glb, minion-d02.glb   (D body)

Quick start (Three.js)
----------------------
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
new GLTFLoader().load('minion-a01.glb', (gltf) => {
  scene.add(gltf.scene);
  // gltf.animations[0] = idle+attack+dead concatenated @ 24fps
});

Usage
-----
Drop straight into Three.js / Babylon.js / Unity / Unreal (glTF import),
vibe-coding games, and AI agent workflows. Clean topology, no cleanup needed.

License
-------
CC0 1.0 (public domain). Free for any use, personal or commercial.
No attribution required (but appreciated). Full text in LICENSE.txt.

More free characters + one-call generation API:
  https://gobkit.com/freebies

(c) Gobkit / Alsomind Tech Co., Ltd. - hello@alsomindtech.com
