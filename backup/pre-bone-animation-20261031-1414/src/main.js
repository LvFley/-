import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

const MODEL_URL = "/models/rainy_konbini.glb";
const MODEL_BYTES = 14934308;
const params = new URLSearchParams(location.search);
const isDebug = params.has("debug");
const isStill = params.has("still");
const noUI = params.has("noui");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const canvas = document.getElementById("stage");
const loaderEl = document.getElementById("loader");
const loaderBar = document.getElementById("loader-bar");
const loaderPct = document.getElementById("loader-pct");
const loaderStatus = document.getElementById("loader-status");
const errorEl = document.getElementById("error");
if (noUI) document.body.classList.add("ui-hidden");

// ---------------------------------------------------------------- renderer
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
    stencil: false,
    preserveDrawingBuffer: isDebug,
  });
} catch (e) {
  showError("WebGL 无法初始化。请确认浏览器已开启硬件加速。", e);
  throw e;
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setClearColor(0x03050b, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(24, 1, 0.06, 260);

// ---------------------------------------------------------------- lighting
const hemi = new THREE.HemisphereLight(0x7796d7, 0x080a10, 1.15);
scene.add(hemi);
const ambient = new THREE.AmbientLight(0x28364d, 0.2);
scene.add(ambient);

const moon = new THREE.DirectionalLight(0xa8c2ff, 2.1);
moon.position.set(-7.5, 13, 10);
moon.target.position.set(0, 1.3, 0);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
moon.shadow.camera.left = -7.5;
moon.shadow.camera.right = 7.5;
moon.shadow.camera.top = 7.5;
moon.shadow.camera.bottom = -7.5;
moon.shadow.camera.near = 0.5;
moon.shadow.camera.far = 42;
moon.shadow.bias = -0.0004;
moon.shadow.normalBias = 0.025;
moon.shadow.radius = 2;
scene.add(moon, moon.target);

const rim = new THREE.DirectionalLight(0x3f69ff, 0.7);
rim.position.set(8, 6, -10);
rim.target.position.set(0, 1, -1);
scene.add(rim, rim.target);

const frontFill = new THREE.DirectionalLight(0x83a4df, 0.55);
frontFill.position.set(-9, 7, 13);
frontFill.target.position.set(0.5, 1.8, 0);
scene.add(frontFill, frontFill.target);

const interior = new THREE.PointLight(0xffb878, 2.6, 5.2, 2);
interior.position.set(0.55, 2.15, -1.35);
scene.add(interior);

const interior2 = new THREE.PointLight(0xffcf9e, 1.2, 4.0, 2);
interior2.position.set(1.75, 1.85, -1.45);
scene.add(interior2);

const coolerGlow = new THREE.PointLight(0x84d9ff, 1.0, 3.2, 2);
coolerGlow.position.set(-0.55, 1.75, -2.15);
scene.add(coolerGlow);

const entryLight = new THREE.PointLight(0xffa05e, 2.2, 5.0, 2);
entryLight.position.set(0.8, 2.15, 0.55);
scene.add(entryLight);

const shopSpill = new THREE.PointLight(0xff9c58, 8, 7.0, 2);
shopSpill.position.set(0.55, 1.05, 2.1);
scene.add(shopSpill);

const streetLight = new THREE.SpotLight(0xffb36b, 22, 9, Math.PI * 0.34, 0.65, 1.6);
streetLight.position.set(-3.25, 4.45, 2.65);
streetLight.target.position.set(-1.1, 0, 2.2);
scene.add(streetLight, streetLight.target);

const vendingLight = new THREE.PointLight(0x72e5ff, 1.8, 3.2, 2);
vendingLight.position.set(3.2, 1.3, 1.1);
scene.add(vendingLight);

// ---------------------------------------------------------------- background + environment
const bg = createBackground();
scene.add(bg);

const env = createEnvironment(renderer);
scene.environment = env.texture;
scene.environmentIntensity = 0.22;

// ---------------------------------------------------------------- post chain
const NAN_SCRUB = {
  name: "NaNScrub",
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      if (c.r != c.r || c.g != c.g || c.b != c.b || c.a != c.a) c = vec4(0.0, 0.0, 0.0, 1.0);
      gl_FragColor = clamp(c, vec4(0.0), vec4(1000.0));
    }
  `,
};

const FINISH_SHADER = {
  name: "Finish",
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uFade: { value: 1 },
    uVignette: { value: 0.3 },
    uGrain: { value: 0.016 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uFade, uVignette, uGrain;
    varying vec2 vUv;
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      // gentle warm highlight / cool shadow grade
      float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(lum), c, 1.2);
      c *= mix(vec3(0.96, 0.99, 1.05), vec3(1.04, 0.995, 0.92), smoothstep(0.05, 0.65, lum));
      // contrast gentle S-curve
      c = mix(c, smoothstep(0.0, 1.0, c), 0.1);
      // vignette
      c *= 1.0 - uVignette * smoothstep(0.06, 0.56, r2);
      // subtle film grain, also dithers the dark gradient
      float n = hash(gl_FragCoord.xy + fract(uTime * 3.17) * 431.0) - 0.5;
      c += n * uGrain * (1.0 - lum * 0.55);
      gl_FragColor = vec4(c * (1.0 - uFade), 1.0);
    }
  `,
};

const renderTarget = new THREE.WebGLRenderTarget(1, 1, {
  type: THREE.HalfFloatType,
  samples: 4,
});
const composer = new EffectComposer(renderer, renderTarget);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new ShaderPass(NAN_SCRUB));
const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.16, 0.25, 0.95);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finish = new ShaderPass(FINISH_SHADER);
finish.uniforms.uFade.value = 1;
composer.addPass(finish);

// ---------------------------------------------------------------- camera + controls
const homeTarget = new THREE.Vector3(0.15, 1.48, 0.0);
const baseHome = new THREE.Vector3(-11.8, 8.0, 14.6);
const homePos = new THREE.Vector3();
const controls = new OrbitControls(camera, canvas);
controls.target.copy(homeTarget);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.rotateSpeed = 0.42;
controls.zoomSpeed = 0.65;
controls.panSpeed = 0.55;
controls.screenSpacePanning = true;
controls.zoomToCursor = false;
controls.minDistance = 0.7;
controls.maxDistance = 12;
controls.minPolarAngle = 0.08;
controls.maxPolarAngle = THREE.MathUtils.degToRad(85);
controls.enablePan = true;
controls.autoRotate = false;

let userInteracted = false;
let thirdPerson = null;
let introT = isStill || reducedMotion ? 1 : 0;
let introStart = 0;
let animStart = 0;
let elapsed = 0;
let lastNow = 0;
let started = false;
let disposed = false;
let viewerReady = false;
const introDuration = 2.3;
const introFrom = new THREE.Vector3();

function desiredHome() {
  const portrait = window.innerWidth / Math.max(1, window.innerHeight) < 0.92;
  const offset = baseHome.clone().sub(homeTarget);
  if (portrait) offset.multiplyScalar(1.42);
  return homeTarget.clone().add(offset);
}
function applyCameraLayout(reposition = true) {
  camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
  const portrait = camera.aspect < 0.92;
  camera.fov = thirdPerson ? (portrait ? 48 : 38) : (portrait ? 33 : 24);
  camera.updateProjectionMatrix();
  if (thirdPerson) return;
  if (reposition && !userInteracted) {
    homePos.copy(desiredHome());
    controls.target.copy(homeTarget);
    if (introT >= 1 || isStill) camera.position.copy(homePos);
  }
}
function startIntro() {
  homePos.copy(desiredHome());
  introFrom.copy(homePos).sub(homeTarget).multiplyScalar(1.11).add(homeTarget);
  camera.position.copy(introFrom);
  controls.target.copy(homeTarget);
  introStart = performance.now();
  introT = isStill || reducedMotion ? 1 : 0;
  if (introT >= 1) camera.position.copy(homePos);
}
startIntro();
controls.addEventListener("start", () => {
  userInteracted = true;
  introT = 1;
  finish.uniforms.uFade.value = 0;
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
window.addEventListener("resize", () => {
  applyCameraLayout(true);
  resizeRenderer();
}, { passive: true });

function resetView() {
  if (thirdPerson) {
    thirdPerson.reset();
    return;
  }
  userInteracted = false;
  introT = 1;
  homePos.copy(desiredHome());
  controls.enableDamping = false;
  controls.update();
  controls.enableDamping = true;
  camera.position.copy(homePos);
  controls.target.copy(homeTarget);
  controls.update();
  finish.uniforms.uFade.value = 0;
}
canvas.addEventListener("dblclick", resetView);
window.addEventListener("keydown", (e) => {
  if (e.key === "h" || e.key === "H") document.body.classList.toggle("ui-hidden");
  if (e.key === "r" || e.key === "R") resetView();
});

// ---------------------------------------------------------------- model + materials + FX
let model = null;
let outlineCount = 0;
let materialCount = 0;
let meshCount = 0;
let bladeMat = null;
let bladeBase = new THREE.Color();
let doorLeft = [];
let doorRight = [];
let trafficLights = [];
let rain = null;
let ripples = [];
let reflectionPlanes = [];
let fxGroup = null;

const materialCache = new Map();
const toonGradient = makeToonGradient();

const loader = new GLTFLoader();
loader.load(
  MODEL_URL,
  async (gltf) => {
    try {
      await onModelLoaded(gltf);
    } catch (e) {
      console.error(e);
      showError("模型载入后初始化失败。", e);
    }
  },
  (event) => {
    const total = event.total || MODEL_BYTES;
    const pct = Math.min(99, Math.round((event.loaded / total) * 100));
    setLoadProgress(pct, "正在构建雨夜街角");
  },
  (e) => {
    console.error(e);
    showError("GLB 模型载入失败，请通过本地 HTTP 服务打开本页。", e);
  }
);

async function onModelLoaded(gltf) {
  model = gltf.scene;
  meshCount = 0;
  const sourceMeshes = [];
  model.traverse((mesh) => {
    if (mesh.isMesh && !mesh.userData.isOutline) sourceMeshes.push(mesh);
  });
  meshCount = sourceMeshes.length;

  for (const mesh of sourceMeshes) {
    const src = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!src) continue;
    if (!materialCache.has(src.name)) {
      materialCache.set(src.name, buildMaterial(src));
      materialCount++;
    }
    mesh.material = materialCache.get(src.name);
    if (mesh.material && mesh.material.transparent) {
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.renderOrder = 4;
    } else if (mesh.material && mesh.material.name.startsWith("E__")) {
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    } else {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  }

  // second pass: add outline shells only after every real mesh has its final material
  for (const mesh of sourceMeshes) {
    const flags = mesh.userData || {};
    const outlineFlag = flags.outline === true || flags.extras?.outline === true;
    if (outlineFlag && !mesh.material.transparent && mesh.geometry.attributes.normal) {
      addOutline(mesh);
      outlineCount++;
    }
  }

  scene.add(model);

  // the GLB was exported from the closed-door frame; these references let us
  // reopen the automatic doors in the browser. glTF loader may sanitise node
  // names (spaces -> underscores), so resolve them with a normalised key.
  const leftNames = ["Auto door L", "Door frame L"];
  const rightNames = ["Auto door R", "Door frame R"];
  doorLeft = leftNames.map((n) => findModelObject(model, n)).filter(Boolean);
  doorRight = rightNames.map((n) => findModelObject(model, n)).filter(Boolean);
  for (const o of [...doorLeft, ...doorRight]) o.userData.closedX = o.position.x;

  const blade = findModelObject(model, "blade sign body");
  if (blade && blade.material) {
    bladeMat = blade.material;
    bladeBase.copy(bladeMat.color);
  }
  trafficLights = [0, 1, 2]
    .map((i) => findModelObject(model, `traffic lamp ${i}`))
    .filter(Boolean)
    .map((o) => ({ mesh: o, material: o.material, base: o.material?.color?.clone() ?? new THREE.Color() }));

  // shadow camera around the diorama
  moon.shadow.camera.left = -8.6;
  moon.shadow.camera.right = 8.6;
  moon.shadow.camera.top = 8.6;
  moon.shadow.camera.bottom = -8.6;
  moon.shadow.camera.updateProjectionMatrix();

  fxGroup = new THREE.Group();
  fxGroup.name = "RainAndWetFX";
  scene.add(fxGroup);
  rain = createRain();
  fxGroup.add(rain.mesh);
  ripples = createRipples();
  for (const r of ripples) fxGroup.add(r.mesh);
  reflectionPlanes = createReflections();
  for (const p of reflectionPlanes) fxGroup.add(p.mesh);

  // The character is an independent add-on. Failure to load it must not stop
  // the existing street scene from rendering.
  try {
    const { attachHffCharacter } = await import("./hffCharacter.js");
    const hff = await attachHffCharacter(scene);
    const { createThirdPersonController } = await import("./thirdPersonController.js");
    thirdPerson = createThirdPersonController({
      character: hff.root,
      camera,
      controls,
      groundY: hff.groundY,
      targetOffsetY: hff.centerYOffset,
    });
    controls.enabled = true;
    userInteracted = true;
    introT = 1;
    finish.uniforms.uFade.value = 0;
    if (isDebug) window.__hffCharacter = hff;
  } catch (e) {
    console.error("[hff_v3] character load failed; street scene continues.", e);
  }

  applyCameraLayout(true);
  if (!isStill && !thirdPerson) startIntro();
  resizeRenderer();

  await renderer.compileAsync(scene, camera);
  setLoadProgress(100, "正在点亮霓虹");
  renderer.render(scene, camera); // trigger shadow compile before composer
  composer.render();

  loaderEl.classList.add("hidden");
  document.body.classList.add("revealed");
  if (isStill) {
    introT = 1;
    if (!thirdPerson) {
      homePos.copy(desiredHome());
      camera.position.copy(homePos);
      controls.target.copy(homeTarget);
    }
    finish.uniforms.uFade.value = 0;
    elapsed = 3.8;
    updateFrame(0, true);
    renderOnce();
    viewerReady = true;
    window.__viewerReady = true;
    exposeDebug();
    return;
  }

  started = true;
  animStart = performance.now();
  viewerReady = true;
  window.__viewerReady = true;
  exposeDebug();
  lastNow = performance.now();
  canvas.focus({ preventScroll: true });
  requestAnimationFrame(tick);
}

function buildMaterial(src) {
  const rawName = src.name || "";
  const color = src.color ? src.color.clone() : new THREE.Color(0xaaaaaa);
  const side = src.side || THREE.FrontSide;

  if (rawName.startsWith("G__")) {
    const glass = new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.055,
      metalness: 0.0,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
      clearcoat: 1,
      clearcoatRoughness: 0.025,
      envMapIntensity: 0.6,
      ior: 1.45,
    });
    glass.name = rawName;
    return glass;
  }

  if (rawName.startsWith("E__")) {
    const base = src.emissive && (src.emissive.r + src.emissive.g + src.emissive.b) > 0.01
      ? src.emissive.clone()
      : color.clone();
    const basic = new THREE.MeshBasicMaterial({
      color: base.multiplyScalar(emissiveBoost(rawName)),
      side,
      transparent: false,
      fog: false,
    });
    basic.name = rawName;
    return basic;
  }

  if (rawName.startsWith("P__")) {
    if (/Lamp halo/i.test(rawName)) {
      const halo = new THREE.MeshBasicMaterial({
        color: color.clone().multiplyScalar(1.35),
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      });
      halo.name = rawName;
      return halo;
    }
    const phys = new THREE.MeshPhysicalMaterial({
      color,
      roughness: src.roughness ?? 0.5,
      metalness: src.metalness ?? 0.0,
      side,
      transparent: Boolean(src.transparent),
      opacity: src.opacity ?? 1.0,
      envMapIntensity: 1.0,
    });
    if (/Wet asphalt/i.test(rawName)) {
      phys.color.setHex(0x121820);
      phys.roughness = 0.55; phys.metalness = 0.02;
      phys.clearcoat = 0.08; phys.clearcoatRoughness = 0.2;
      phys.envMapIntensity = 0.08;
    } else if (/Puddle/i.test(rawName)) {
      phys.roughness = 0.04; phys.metalness = 0.20;
      phys.clearcoat = 1.0; phys.clearcoatRoughness = 0.02;
      phys.envMapIntensity = 0.5;
    } else if (/Wet road paint/i.test(rawName)) {
      phys.roughness = 0.30; phys.clearcoat = 0.2;
      phys.clearcoatRoughness = 0.1; phys.envMapIntensity = 0.2;
    } else if (/Mirror/i.test(rawName)) {
      phys.roughness = 0.045; phys.metalness = 0.8;
      phys.envMapIntensity = 1.8;
    } else if (/Roof water/i.test(rawName)) {
      phys.roughness = 0.05; phys.metalness = 0.25;
      phys.envMapIntensity = 1.3;
    }
    phys.name = rawName;
    return phys;
  }

  // toon material
  const toon = new THREE.MeshToonMaterial({
    color,
    gradientMap: toonGradient,
    side,
    transparent: Boolean(src.transparent),
    opacity: src.opacity ?? 1.0,
    alphaTest: src.alphaTest ?? 0,
  });
  toon.name = rawName;
  return toon;
}

function emissiveBoost(name) {
  if (/Streetlight core|Pendant bulb/i.test(name)) return 1.6;
  if (/Neon|Sign halo|Awning neon|Vending header|Rack header|Endcap header|Hot sign|Oden sign|Banner|Door banner/i.test(name)) return 1.25;
  if (/Sign white|Light white|Light warm|Ceiling warm|Downlight|Cooler LED|Cooler back|Deli|Promo|Entrance|Rack light|Guide|Traffic/i.test(name)) return 0.96;
  return 1.0;
}

const outlineUniforms = {
  uThicknessPx: { value: 1.7 },
  uResolution: { value: new THREE.Vector2(1, 1) },
  uColor: { value: new THREE.Color(0x0b1119) },
};
const outlineMaterial = new THREE.ShaderMaterial({
  uniforms: outlineUniforms,
  vertexShader: /* glsl */ `
    uniform float uThicknessPx;
    uniform vec2 uResolution;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vec4 clip = projectionMatrix * mv;
      vec3 vn = normalize(normalMatrix * normal);
      vec2 dir = (projectionMatrix * vec4(vn, 0.0)).xy;
      float l = length(dir);
      dir = l > 0.00001 ? dir / l : vec2(0.0);
      clip.xy += dir * uThicknessPx * 2.0 / uResolution * clip.w;
      gl_Position = clip;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    void main() { gl_FragColor = vec4(uColor, 1.0); }
  `,
  side: THREE.BackSide,
  depthWrite: true,
  depthTest: true,
});
outlineMaterial.name = "InkOutline";

function addOutline(mesh) {
  const outline = new THREE.Mesh(mesh.geometry, outlineMaterial);
  outline.name = "Outlined";
  outline.castShadow = false;
  outline.receiveShadow = false;
  outline.frustumCulled = false;
  outline.userData.isOutline = true;
  mesh.add(outline);
}

function findModelObject(root, name) {
  const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const target = norm(name);
  let found = null;
  root.traverse((o) => {
    if (!found && o.name && norm(o.name) === target) found = o;
  });
  return found || root.getObjectByName(name);
}

// ---------------------------------------------------------------- animation
function tick(now) {
  if (disposed) return;
  requestAnimationFrame(tick);
  if (!started || document.hidden) {
    lastNow = now;
    return;
  }
  const dt = Math.min((now - (lastNow || now)) / 1000, 0.05);
  lastNow = now;
  if (!isStill) elapsed = (now - animStart) / 1000;
  updateFrame(dt, false);
  renderOnce();
}

function updateFrame(dt, stillPass) {
  if (thirdPerson) {
    if (stillPass) thirdPerson.syncCamera();
    else thirdPerson.update();
  } else if (!isStill) {
    if (introT < 1 && !userInteracted && !reducedMotion) {
      const seconds = (performance.now() - introStart) / 1000;
      introT = Math.min(1, seconds / introDuration);
      const e = 1 - Math.pow(1 - introT, 3);
      homePos.copy(desiredHome());
      camera.position.lerpVectors(introFrom, homePos, e);
      controls.target.copy(homeTarget);
      finish.uniforms.uFade.value = 1 - Math.min(1, introT * 1.9);
    } else {
      if (userInteracted || reducedMotion) {
        finish.uniforms.uFade.value = 0;
      } else {
        finish.uniforms.uFade.value = Math.max(0, finish.uniforms.uFade.value - dt * 2.2);
      }
      controls.update();
    }
  }

  if (rain) rain.uniforms.uTime.value = elapsed;
  updateDoors(elapsed);
  updateTraffic(elapsed);
  updateBladeFlicker(elapsed);
  updateRipples(elapsed);
  for (let i = 0; i < reflectionPlanes.length; i++) {
    const p = reflectionPlanes[i];
    p.mesh.material.opacity = p.mesh.userData.baseOpacity * (0.86 + 0.14 * Math.sin(elapsed * 1.2 + i * 1.7));
  }
  finish.uniforms.uTime.value = elapsed;
}

function updateDoors(t) {
  const period = 11.0;
  const c = t % period;
  let open = 0;
  if (c >= 2.6 && c < 3.35) open = smoothstep((c - 2.6) / 0.75);
  else if (c >= 3.35 && c < 7.2) open = 1;
  else if (c >= 7.2 && c < 7.95) open = 1 - smoothstep((c - 7.2) / 0.75);
  for (const o of doorLeft) o.position.x = o.userData.closedX - 0.32 * open;
  for (const o of doorRight) o.position.x = o.userData.closedX + 0.32 * open;
  if (entryLight) entryLight.intensity = 3.2 + open * 2.0;
}

function updateTraffic(t) {
  if (!trafficLights.length) return;
  const c = t % 9.0;
  let active = 2; // green
  if (c >= 4.8 && c < 5.7) active = 1; // amber
  else if (c >= 5.7) active = 0; // red
  for (let i = 0; i < trafficLights.length; i++) {
    const l = trafficLights[i];
    if (!l.material) continue;
    const on = i === active;
    l.material.color.copy(l.base).multiplyScalar(on ? 1.25 : 0.055);
  }
}

function updateBladeFlicker(t) {
  if (!bladeMat) return;
  const c = t % 12.0;
  let k = 1;
  if (c > 8.2 && c < 8.7) {
    const f = (c - 8.2) / 0.5;
    k = 0.28 + 0.7 * Math.abs(Math.sin(f * 28.0));
  }
  bladeMat.color.copy(bladeBase).multiplyScalar(k);
}

function updateRipples(t) {
  for (const r of ripples) {
    const p = ((t * r.userData.speed + r.userData.phase) % 1 + 1) % 1;
    const e = 0.06 + p * 0.94;
    r.mesh.scale.setScalar(r.userData.radius * e);
    r.mesh.material.opacity = 0.32 * (1 - p) * (0.35 + 0.65 * Math.sin(Math.min(1, p * 1.6) * Math.PI));
  }
}

function smoothstep(x) {
  x = Math.max(0, Math.min(1, x));
  return x * x * (3 - 2 * x);
}

// ---------------------------------------------------------------- rain
function createRain() {
  const count = 900;
  const rng = mulberry32(93241);
  const positions = new Float32Array(count * 2 * 3);
  const speed = new Float32Array(count * 2);
  const phase = new Float32Array(count * 2);
  const len = new Float32Array(count * 2);
  const end = new Float32Array(count * 2);
  let i = 0;
  let guard = 0;
  while (i < count && guard < count * 20) {
    guard++;
    const x = (rng() - 0.5) * 11.5;
    const z = (rng() - 0.5) * 11.5;
    // keep the inside of the shop and the awning dry
    if (x > -2.05 && x < 3.05 && z > -3.25 && z < 1.28) continue;
    const baseY = rng() * 7.4 + 0.15;
    const length = 0.16 + rng() * 0.30;
    const s = 0.85 + rng() * 0.85;
    const ph = rng() * 7.0;
    for (let v = 0; v < 2; v++) {
      const n = (i * 2 + v) * 3;
      positions[n] = x;
      positions[n + 1] = baseY;
      positions[n + 2] = z;
      speed[i * 2 + v] = s;
      phase[i * 2 + v] = ph;
      len[i * 2 + v] = length;
      end[i * 2 + v] = v;
    }
    i++;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aSpeed", new THREE.BufferAttribute(speed, 1));
  geo.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
  geo.setAttribute("aLen", new THREE.BufferAttribute(len, 1));
  geo.setAttribute("aEnd", new THREE.BufferAttribute(end, 1));
  const uniforms = {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(0xb9ddff) },
    uOpacity: { value: 0.19 },
    uHeight: { value: 7.7 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uHeight;
      attribute float aSpeed;
      attribute float aPhase;
      attribute float aLen;
      attribute float aEnd;
      varying float vA;
      void main() {
        float y = mod(position.y - uTime * aSpeed + aPhase * uHeight, uHeight) + 0.08;
        y -= aEnd * aLen;
        vec3 p = vec3(position.x + aEnd * 0.055, y, position.z);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        vA = mix(1.0, 0.42, aEnd);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vA;
      void main() {
        gl_FragColor = vec4(uColor, uOpacity * vA);
      }
    `,
  });
  const mesh = new THREE.LineSegments(geo, mat);
  mesh.name = "Rain";
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return { mesh, uniforms };
}

// ---------------------------------------------------------------- ripples
function createRipples() {
  const data = [
    [-1.55, 2.65, 0.14, 0.057, 0.06], [0.15, 2.35, 0.19, 0.057, 0.15],
    [0.55, 3.36, 0.12, 0.057, 0.37], [2.75, 2.38, 0.10, 0.057, 0.55],
    [-3.10, 3.28, 0.11, 0.057, 0.73], [0.20, 1.72, 0.075, 0.057, 0.91],
    [-0.65, 0.75, 0.13, 0.140, 0.28], [2.18, 0.95, 0.11, 0.140, 0.66],
    [0.62, 0.82, 0.08, 0.140, 0.44], [1.38, 0.92, 0.07, 0.140, 0.84],
  ];
  const geo = new THREE.RingGeometry(0.78, 1.0, 40);
  geo.rotateX(-Math.PI / 2);
  const out = [];
  for (const [x, z, radius, y, phase] of data) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xc4eaff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y + 0.004, z);
    mesh.scale.setScalar(radius * 0.1);
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    out.push({ mesh, userData: { radius, phase, speed: 0.42 + (phase % 0.3) } });
  }
  return out;
}

// ---------------------------------------------------------------- painterly wet reflections
function createReflections() {
  const tex = makeStreakTexture();
  const defs = [
    [0.55, 2.45, 0.46, 2.8, 0xffa361, 0.55, 0.071],
    [1.16, 2.8, 0.22, 2.3, 0xffd3a0, 0.42, 0.072],
    [3.10, 2.25, 0.28, 1.9, 0x55e2ff, 0.42, 0.071],
    [3.72, 2.05, 0.18, 1.6, 0x78ecff, 0.30, 0.071],
    [1.95, 2.7, 0.12, 2.5, 0xff7460, 0.26, 0.071],
    [-1.25, 2.5, 0.16, 1.8, 0xff5dac, 0.26, 0.071],
    [0.55, 0.75, 0.3, 0.9, 0xffad6c, 0.32, 0.144],
  ];
  const out = [];
  for (const [x, z, w, len, tint, opacity, y] of defs) {
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      color: new THREE.Color(tint),
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, len), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.renderOrder = 2;
    mesh.userData.baseOpacity = opacity;
    out.push({ mesh, material: mat });
  }
  return out;
}

function makeStreakTexture() {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.16, "rgba(255,255,255,0.55)");
  g.addColorStop(0.42, "rgba(255,255,255,1)");
  g.addColorStop(0.72, "rgba(255,255,255,0.42)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 256);
  ctx.globalCompositeOperation = "destination-in";
  const h = ctx.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, "rgba(255,255,255,0)");
  h.addColorStop(0.3, "rgba(255,255,255,0.8)");
  h.addColorStop(0.7, "rgba(255,255,255,0.8)");
  h.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = h;
  ctx.fillRect(0, 0, 64, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

// ---------------------------------------------------------------- helpers
function makeToonGradient() {
  const data = new Uint8Array([
    72, 72, 72, 255,
    134, 134, 134, 255,
    200, 200, 200, 255,
    255, 255, 255, 255,
  ]);
  const tex = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createBackground() {
  const geo = new THREE.SphereGeometry(120, 32, 18);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(0x010206) },
      uMid: { value: new THREE.Color(0x06101f) },
      uBottom: { value: new THREE.Color(0x091521) },
      uGlow: { value: new THREE.Color(0x102139) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uMid, uBottom, uGlow;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, -1.0, 1.0);
        vec3 c = mix(uBottom, uMid, smoothstep(-0.22, 0.28, h));
        c = mix(c, uTop, smoothstep(0.22, 0.85, h));
        float glow = exp(-abs(h - 0.015) * 9.0);
        c += uGlow * glow * 0.11;
        gl_FragColor = vec4(c, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "NightBackground";
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;
  return mesh;
}

function createEnvironment(renderer) {
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x050912);
  const warm = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 12),
    new THREE.MeshBasicMaterial({ color: 0xffa05d, side: THREE.DoubleSide })
  );
  warm.position.set(-13, 5, 7);
  warm.lookAt(0, 0, 0);
  envScene.add(warm);
  const cyan = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 9),
    new THREE.MeshBasicMaterial({ color: 0x3ac9ec, side: THREE.DoubleSide })
  );
  cyan.position.set(14, 3, -4);
  cyan.lookAt(0, 0, 0);
  envScene.add(cyan);
  const top = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshBasicMaterial({ color: 0x2f4c8a, side: THREE.DoubleSide })
  );
  top.position.set(0, 18, 0);
  top.rotation.x = Math.PI / 2;
  envScene.add(top);
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const rt = pmrem.fromScene(envScene, 0.05, 0.1, 100);
  pmrem.dispose();
  return { texture: rt.texture, target: rt };
}

function setLoadProgress(pct, status) {
  loaderBar.style.width = pct + "%";
  loaderPct.textContent = pct + "%";
  if (status) loaderStatus.textContent = status;
}

function showError(message, e) {
  console.error(e || message);
  if (errorEl) {
    errorEl.hidden = false;
    errorEl.textContent = message;
  }
  loaderEl.classList.add("hidden");
}

function resizeRenderer() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const pr = Math.min(window.devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(pr);
  composer.setSize(w, h);
  bloom.resolution.set(w * pr * 0.5, h * pr * 0.5);
  outlineUniforms.uResolution.value.set(w * pr, h * pr);
  finish.uniforms.uResolution?.value?.set(w, h);
}
resizeRenderer();

function renderOnce() {
  // OrbitControls owns the camera; the controller only moves the orbit rig.
  controls.update();
  composer.render();
}
applyCameraLayout(true);

function exposeDebug() {
  if (!isDebug) return;
  window.__viewer = {
    scene,
    camera,
    renderer,
    controls,
    model,
    get thirdPerson() { return thirdPerson; },
    get ready() { return viewerReady; },
    setTime(t) {
      elapsed = t;
      updateFrame(0, true);
      introT = 1;
      finish.uniforms.uFade.value = 0;
      renderOnce();
    },
    renderOnce,
    resetView,
    info() {
      return {
        meshes: meshCount,
        materials: materialCount,
        outlines: outlineCount,
        draws: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
      };
    },
  };
}

// ---------------------------------------------------------------- shaders
function mulberry32(a) {
  return function () {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
