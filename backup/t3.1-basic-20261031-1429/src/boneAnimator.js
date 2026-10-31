const BONE_NAMES = [
  "Hips",
  "Spine",
  "Head",
  "LeftArm",
  "RightArm",
  "LeftLeg",
  "RightLeg",
];

/**
 * Procedural HFF-style wobble for the seven exported bones.
 *
 * There is no AnimationMixer here: every frame is a time-driven sine/cosine
 * offset added to the bone's captured bind rotation. Idle and walk amplitudes
 * are blended with a frame-rate-independent lerp so starting/stopping never
 * snaps the pose.
 */
export function createBoneAnimator({ bones }) {
  const base = {};
  for (const name of BONE_NAMES) {
    const bone = bones?.[name];
    if (!bone) continue;
    base[name] = {
      x: bone.rotation.x,
      y: bone.rotation.y,
      z: bone.rotation.z,
      positionY: bone.position.y,
    };
  }

  const available = Object.keys(base);
  let time = 0;
  let walkWeight = 0;
  let phase = 0;

  // HFF proportions: big, loose limbs; small hip/head accents.
  const legAmplitude = 0.62;
  const armAmplitude = 0.5;
  const hipTiltAmplitude = 0.085;
  const hipTwistAmplitude = 0.06;
  const hipBobAmplitude = 0.022;
  const spineLean = 0.045;
  const headCounter = 0.035;
  const walkCadence = 8.6;
  const breathCadence = 1.7;
  const blendRate = 6.5;

  function restoreBase() {
    for (const name of available) {
      const bone = bones[name];
      const init = base[name];
      bone.rotation.x = init.x;
      bone.rotation.y = init.y;
      bone.rotation.z = init.z;
      if (name === "Hips") bone.position.y = init.positionY;
    }
  }

  function reset() {
    time = 0;
    phase = 0;
    walkWeight = 0;
    restoreBase();
  }

  function update(dt, moving) {
    if (dt <= 0) return;
    time += dt;
    phase += dt * walkCadence;

    // Smooth walk <-> idle amplitude transition. The target is the input
    // state; the actual pose amplitude eases in/out over several frames.
    const targetWeight = moving ? 1 : 0;
    const blend = 1 - Math.exp(-blendRate * dt);
    walkWeight += (targetWeight - walkWeight) * blend;
    if (walkWeight < 0.0005) walkWeight = 0;
    const idleWeight = 1 - walkWeight;

    const legSwing = Math.sin(phase);
    const armSwing = Math.sin(phase + Math.PI);
    const hipRoll = Math.sin(phase);
    const hipTwist = Math.cos(phase);
    const stepBob = Math.sin(phase * 2);

    // Reset every controlled rotation to its bind pose before adding the new
    // offsets. This is what keeps the animation from accumulating/distorting.
    restoreBase();

    if (bones.Hips) {
      const hips = bones.Hips;
      hips.position.y =
        base.Hips.positionY +
        hipBobAmplitude * stepBob * walkWeight +
        Math.sin(time * breathCadence) * 0.007 * idleWeight;
      hips.rotation.z =
        base.Hips.z +
        hipTiltAmplitude * hipRoll * walkWeight +
        Math.sin(time * breathCadence * 0.8) * 0.008 * idleWeight;
      hips.rotation.y =
        base.Hips.y + hipTwistAmplitude * hipTwist * walkWeight;
    }

    if (bones.Spine) {
      const spine = bones.Spine;
      spine.rotation.x =
        base.Spine.x +
        spineLean * walkWeight +
        Math.sin(time * breathCadence) * 0.014 * idleWeight;
      spine.rotation.z =
        base.Spine.z +
        -hipTiltAmplitude * 0.35 * hipRoll * walkWeight +
        Math.sin(time * breathCadence * 0.8 + 0.4) * 0.007 * idleWeight;
    }

    if (bones.LeftLeg) {
      bones.LeftLeg.rotation.x =
        base.LeftLeg.x + legAmplitude * legSwing * walkWeight;
    }
    if (bones.RightLeg) {
      bones.RightLeg.rotation.x =
        base.RightLeg.x - legAmplitude * legSwing * walkWeight;
    }

    if (bones.LeftArm) {
      bones.LeftArm.rotation.x =
        base.LeftArm.x +
        armAmplitude * armSwing * walkWeight +
        Math.sin(time * breathCadence + 1.1) * 0.01 * idleWeight;
      bones.LeftArm.rotation.z =
        base.LeftArm.z +
        Math.sin(time * breathCadence + 0.3) * 0.012 * idleWeight;
    }
    if (bones.RightArm) {
      bones.RightArm.rotation.x =
        base.RightArm.x -
        armAmplitude * armSwing * walkWeight +
        Math.sin(time * breathCadence + 2.1) * 0.01 * idleWeight;
      bones.RightArm.rotation.z =
        base.RightArm.z +
        Math.sin(time * breathCadence + 1.3) * 0.012 * idleWeight;
    }

    if (bones.Head) {
      const head = bones.Head;
      head.rotation.x =
        base.Head.x +
        Math.sin(time * breathCadence + 0.9) * 0.012 * idleWeight;
      head.rotation.z =
        base.Head.z +
        Math.sin(time * breathCadence * 0.8 + 1.2) * 0.01 * idleWeight +
        -headCounter * hipRoll * walkWeight;
      head.rotation.y =
        base.Head.y +
        Math.sin(time * breathCadence * 0.7 + 0.2) * 0.008 * idleWeight +
        0.02 * hipTwist * walkWeight;
    }

    // The body has only 7 bones; this is intentionally exaggerated enough to
    // read as a soft ragdoll without moving the root or touching the mesh.
    if (bones.Spine) {
      bones.Spine.rotation.y =
        base.Spine.y + hipTwist * 0.03 * walkWeight;
    }
  }

  return {
    update,
    reset,
    get walkWeight() {
      return walkWeight;
    },
    get time() {
      return time;
    },
    get bones() {
      return available;
    },
  };
}