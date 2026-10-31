import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * Load the stand-alone HFF character and drop it at the street-scene centre.
 *
 * The module leaves the street geometry, lights and materials untouched. It
 * only scales the character, finds the street height, centres the character on
 * X/Z, puts its feet on that surface, and logs the skeleton / animation probe.
 *
 * The exported GLB is Y-up and its local forward is +Z. The module does not
 * rotate the root; the controller owns the initial/facing rotation.
 */
export async function attachHffCharacter(scene, options = {}) {
  const url = options.url || "/models/hff_v3.glb";
  const characterScale = Number.isFinite(options.characterScale) ? options.characterScale : 0.5;
  // The exact origin (0, 0) sits on the storefront glass plane. Keep X centred
  // but step into the street so an orbit camera has room around the character.
  const centerZ = Number.isFinite(options.centerZ) ? options.centerZ : 2.8;
  const gltf = await new GLTFLoader().loadAsync(url);
  const root = gltf.scene;
  root.name = "HFF_v3_Character";

  // --- ground calibration -------------------------------------------------
  // A scene-wide downward ray can hit the awning/roof at the storefront, so
  // cast only against surfaces that are actual street/plinth ground.
  const groundCandidates = [];
  scene.traverse((object) => {
    if (!object.isMesh || object.userData.isOutline) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const names = materials.filter(Boolean).map((material) => material.name || "");
    if (names.some((name) => /sidewalk|asphalt|plinth/i.test(name))) {
      groundCandidates.push(object);
    }
  });

  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(0, 50, centerZ),
    new THREE.Vector3(0, -1, 0),
    0,
    100
  );
  const hits = raycaster.intersectObjects(groundCandidates, false);
  const streetHit = hits.find((hit) => hit.point.y > -0.05 && hit.point.y < 0.6);
  const groundY = streetHit ? streetHit.point.y : 0.12;

  // --- scale, centre on X/Z, feet on ground -------------------------------
  root.scale.setScalar(characterScale);
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const centre = bounds.getCenter(new THREE.Vector3());
  root.position.x -= centre.x;
  root.position.z -= centre.z;
  root.position.z += centerZ;
  root.position.y += groundY - bounds.min.y;
  root.updateMatrixWorld(true);

  // Final world-space measurements after placement. The orbit target should
  // sit at the body's vertical centre, not at the feet.
  const finalBounds = new THREE.Box3().setFromObject(root);
  const finalCentre = finalBounds.getCenter(new THREE.Vector3());
  const height = finalBounds.max.y - finalBounds.min.y;
  const centerYOffset = finalCentre.y - root.position.y;

  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material && "envMapIntensity" in material) material.envMapIntensity = 0.7;
    }
  });

  scene.add(root);

  // --- skeleton + animation probe ----------------------------------------
  const boneNames = [];
  const seenBones = new Set();
  let headBone = null;
  root.traverse((object) => {
    if (!object.isBone || seenBones.has(object)) return;
    seenBones.add(object);
    boneNames.push(object.name || "(unnamed bone)");
    if (!headBone && /head/i.test(object.name)) headBone = object;
  });

  const clips = gltf.animations || [];
  const actionNames = clips.map((clip) => clip.name || "(unnamed clip)");

  console.log(`[hff_v3] Bone Names (${boneNames.length}):`, boneNames);
  console.log(`[hff_v3] Animation Action Names (${actionNames.length}):`, actionNames);
  if (clips.length === 0) {
    console.log("[hff_v3] This GLB contains no animation clips; no AnimationMixer actions were created.");
  }

  console.log("[hff_v3] Ground surface:", {
    y: Number(groundY.toFixed(4)),
    object: streetHit?.object?.name || "(fallback)",
  });
  console.log("[hff_v3] Placed at:", root.position.toArray().map((value) => Number(value.toFixed(4))));
  console.log(`[hff_v3] Scale: ${characterScale.toFixed(2)}×, world height: ${height.toFixed(3)} m.`);
  console.log(`[hff_v3] Street-side start: z=${centerZ.toFixed(2)} m (orbit-camera clearance).`);
  console.log("[hff_v3] Local forward is +Z; the controller owns the initial root yaw.");

  root.userData.hffProbe = {
    boneNames,
    actionNames,
    groundY,
    scale: characterScale,
    height,
    centerYOffset,
    position: root.position.toArray(),
  };

  return {
    root,
    boneNames,
    actionNames,
    groundY,
    headBone,
    scale: characterScale,
    height,
    centerYOffset,
  };
}