Gobkit Free Bird Pack — 10 CC0 rigged & animated low-poly birds (GLB)
https://gobkit.com/freebies

Birds: Toucan, Flamingo, Pelican, Penguin, Macaw, Eagle, Hummingbird, Peacock, Rooster, Kiwi
Each .glb is one model with its texture baked in, plus the shared atlas Texture001.png.

Animation: 4 clips per model @ 24 fps:
  idle (loop) | attack (loop) | dead (play once, hold) | walk (loop)
  (same frame ranges as the other Gobkit packs: idle 0-29 | attack 30-59 | dead 60-89 | walk 90-119)

Three.js quick start:
  import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
  new GLTFLoader().load('Toucan.glb', (g) => { scene.add(g.scene);
    const mixer = new THREE.AnimationMixer(g.scene);
    mixer.clipAction(g.animations.find(a => a.name === 'idle')).play(); });

License: CC0 1.0 (public domain) — any use, commercial or personal, no attribution required.
More free CC0 assets + one-call generation API: https://gobkit.com/api/free
