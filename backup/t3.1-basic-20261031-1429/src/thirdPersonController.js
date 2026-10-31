import * as THREE from "three";
import { createBoneAnimator } from "./boneAnimator.js";

const UP = new THREE.Vector3(0, 1, 0);
const MOVE_CODES = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD",
  "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight",
]);

/**
 * Camera-relative walker for the HFF character.
 *
 * - WASD / arrow keys move on XZ only, relative to the current OrbitControls
 *   camera: W is always screen-forward, D is always screen-right.
 * - THREE.Clock supplies the real frame delta; movement is never frame-locked.
 * - The character's rotation.y turns toward the movement vector with
 *   shortest-angle damping.
 * - The camera is owned by OrbitControls. The controller only translates the
 *   orbit target and camera by the character's movement delta, so mouse orbit,
 *   right-button pan and wheel zoom remain fully free. It never lerps the
 *   camera to a hard-coded "behind the character" pose.
 * - No physics, collision response, or skeleton animation.
 */
export function createThirdPersonController({
  character,
  camera,
  controls,
  bones = {},
  groundY = 0,
  targetOffsetY = 0.34,
  initialYaw = Math.PI,
  initialCameraOffset = new THREE.Vector3(0, 1.2, 2.6),
  speed = 1.8,
  moveDamping = 10,
  turnDamping = 12,
}) {
  const clock = new THREE.Clock();
  // Start immediately so the first update reports real elapsed time instead of
  // Clock's initial zero delta.
  clock.start();
  const animator = createBoneAnimator({ bones });

  const keys = new Set();
  const input = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const targetVelocity = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const center = new THREE.Vector3();

  const startPosition = character.position.clone();
  const startYaw = initialYaw;
  character.rotation.y = startYaw;
  let currentYaw = startYaw;
  let lastX = character.position.x;
  let lastZ = character.position.z;

  function isMoveCode(code) {
    return MOVE_CODES.has(code);
  }

  function onKeyDown(event) {
    if (!isMoveCode(event.code)) return;
    // Do not let arrow keys scroll the page while walking.
    event.preventDefault();
    keys.add(event.code);
  }

  function onKeyUp(event) {
    if (!isMoveCode(event.code)) return;
    event.preventDefault();
    keys.delete(event.code);
  }

  function clearKeys() {
    keys.clear();
  }

  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp, { passive: false });
  window.addEventListener("blur", clearKeys);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearKeys();
  });

  function getCenter() {
    center.set(
      character.position.x,
      groundY + targetOffsetY,
      character.position.z
    );
    return center;
  }

  function placeCamera() {
    character.position.y = groundY;
    character.rotation.y = startYaw;
    animator.reset();
    getCenter();
    controls.target.copy(center);
    camera.position.copy(center).add(initialCameraOffset);
    controls.update();
    lastX = character.position.x;
    lastZ = character.position.z;
  }

  function readInput() {
    // Camera-relative basis. OrbitControls keeps the camera looking at the
    // target, so this is the screen-forward direction projected onto XZ.
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-8) {
      // Degenerate only if the camera looks straight down; maxPolarAngle keeps
      // us away from that, but keep a safe fallback.
      forward.set(0, 0, -1);
    } else {
      forward.normalize();
    }
    right.crossVectors(forward, UP).normalize();

    input.set(0, 0, 0);
    if (keys.has("KeyW") || keys.has("ArrowUp")) input.add(forward);
    if (keys.has("KeyS") || keys.has("ArrowDown")) input.sub(forward);
    if (keys.has("KeyD") || keys.has("ArrowRight")) input.add(right);
    if (keys.has("KeyA") || keys.has("ArrowLeft")) input.sub(right);
    if (input.lengthSq() > 1) input.normalize();
    return input;
  }

  function reset() {
    character.position.copy(startPosition);
    character.position.y = groundY;
    character.rotation.y = startYaw;
    currentYaw = startYaw;
    velocity.set(0, 0, 0);
    keys.clear();
    clock.getDelta(); // discard time spent while resetting
    character.updateMatrixWorld(true);
    placeCamera();
  }

  function snap() {
    reset();
  }

  function update() {
    const dt = Math.min(clock.getDelta(), 0.1);
    if (dt <= 0) return;

    readInput();
    targetVelocity.copy(input).multiplyScalar(speed);

    const acceleration = 1 - Math.exp(-moveDamping * dt);
    velocity.lerp(targetVelocity, acceleration);
    if (velocity.lengthSq() < 1e-7) velocity.set(0, 0, 0);

    character.position.x += velocity.x * dt;
    character.position.z += velocity.z * dt;
    character.position.y = groundY; // XZ only; no gravity or wall response

    if (input.lengthSq() > 0.0001) {
      const targetYaw = Math.atan2(input.x, input.z);
      const angleDelta = Math.atan2(
        Math.sin(targetYaw - currentYaw),
        Math.cos(targetYaw - currentYaw)
      );
      currentYaw += angleDelta * (1 - Math.exp(-turnDamping * dt));
      character.rotation.y = currentYaw;
    }

    // Procedural 7-bone idle/walk animation. `input` is used instead of the
    // decaying velocity so the amplitude target switches as soon as the key
    // state changes; the animator itself eases that target.
    animator.update(dt, input.lengthSq() > 0.0001);

    // Move the orbit rig with the character. This preserves the user's current
    // orbit angle, pan offset and zoom distance; no camera lerp is involved.
    const dx = character.position.x - lastX;
    const dz = character.position.z - lastZ;
    if (dx !== 0 || dz !== 0) {
      controls.target.x += dx;
      controls.target.z += dz;
      camera.position.x += dx;
      camera.position.z += dz;
      lastX = character.position.x;
      lastZ = character.position.z;
    }

    // Keep a right-button vertical pan from pushing the orbit target (and thus
    // the camera at maxPolarAngle) under the street plane.
    const minTargetY = groundY + 0.12;
    if (controls.target.y < minTargetY) {
      const dy = minTargetY - controls.target.y;
      controls.target.y += dy;
      camera.position.y += dy;
    }
    character.updateMatrixWorld(true);
  }

  // Camera is set up once; after this OrbitControls owns its position.
  placeCamera();

  return {
    update,
    reset,
    snap,
    syncCamera: placeCamera,
    animator,
    get keys() {
      return keys;
    },
    get position() {
      return character.position;
    },
    get yaw() {
      return currentYaw;
    },
  };
}