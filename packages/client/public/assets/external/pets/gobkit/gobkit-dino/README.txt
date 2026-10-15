Gobkit Free Dinosaur Pack — 10 CC0 rigged & animated low-poly dinosaurs (GLB)
https://gobkit.com/freebies

Dinosaurs: Trex, Triceratops, Stegosaurus, Ankylosaurus, Spinosaurus, Carnotaurus, Pachycephalosaurus, Oviraptor, Pterodactylus, Plesiosaurus
Each .glb is one model with its texture baked in, plus the shared atlas Texture001.png.

Animation: ONE baked track per model @ 24 fps, split into frame ranges:
  idle 0-29 (loop) | attack 30-59 (loop) | dead 60-89 (play once, hold) | walk 90-119 (loop)

Three.js quick start:
  import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
  new GLTFLoader().load('Trex.glb', (g) => { scene.add(g.scene);
    const mixer = new THREE.AnimationMixer(g.scene);
    mixer.clipAction(g.animations[0]).play(); });  // scrub ranges; don't loop 'dead'

License: CC0 1.0 (public domain) — any use, commercial or personal, no attribution required.
More free CC0 assets + one-call generation API: https://gobkit.com/api/free
