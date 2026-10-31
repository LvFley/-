# 星見町 2丁目 — Three.js Viewer

雨夜便利店微缩模型的交互式网页版本。不是视频，也不是贴图全景：整个场景是 Blender 导出的实时 glTF 几何，雨、积水波纹、自动门、刀旗灯箱和信号灯都由 JavaScript / GLSL 在浏览器里实时驱动。

## 运行

```bash
cd viewer
npm install
npm run dev
```

打开 **http://127.0.0.1:8092/**。

生产构建：

```bash
npm run build
npm run preview
```

构建产物在 `viewer/dist/`。当前开发服务器默认绑定 `127.0.0.1:8092`，只在本机可访问。

## 操作

| 操作 | 说明 |
|---|---|
| 左键拖拽 | 以人物为中心环绕旋转 |
| 右键拖拽 | 平移视角 |
| 滚轮 | 拉近 / 拉远 |
| `W` / `↑` | 朝屏幕前方走 |
| `S` / `↓` | 朝屏幕后方走 |
| `A` / `←` | 朝屏幕左侧走 |
| `D` / `→` | 朝屏幕右侧走 |
| 双击画布 / `R` | 角色与镜头回到出发点 |
| `H` | 显示 / 隐藏界面文字 |

角色缩小为 **0.5×**，世界高度约 **0.675 m**，脚底按新的缩放后包围盒重新贴地。

相机由 Three.js 官方 `OrbitControls` 控制，`target` 初始化在人物包围盒中心（约 `y = 0.337`）。角色移动时只把 `controls.target` 和 `camera.position` 按同一个位移量平移，保留当前的环绕角度、平移偏移和缩放距离；**没有**每帧把相机 `lerp` 到人物背后的写法，所以鼠标可以一直自由旋转。右键平移产生的 target 偏移也会被保留。

`maxPolarAngle` 约为 **85°**，避免镜头穿到地面以下；滚轮距离限制在 `0.7–12 m`。

WASD / 方向键不是固定世界方向：每帧用相机当前朝向投影到 XZ 平面，得到“屏幕前方”和“屏幕右方”，所以无论镜头转到哪，`W` 都朝屏幕前方走；`rotation.y` 再用最短角阻尼平滑转向移动方向。

自动门在进入页面约 3 秒后开启，此后按 11 秒周期开合。

## 场景与导出

- 模型：`public/models/rainy_konbini.glb`，14.9 MB，208 个网格、204 个材质、约 27.3 万三角面。
- 导出脚本：`../scripts/export_web.py`。从 `rainy_konbini.blend` 的帧状态导出，删除雨丝/波纹/雾卡/反射探针等运行时特效，保留积水与落叶；曲线与字体先转换为网格；静态物体按材质合并，自动门、门框、刀旗和三个信号灯保持独立节点。
- glTF extras 里的 `outline: true/false` 决定哪些物体在网页里加轮廓线；共 89 个带轮廓网格。

### 材质约定

导出材质名带前缀，浏览器端据此重建着色器：

| 前缀 | 数量 | 处理 |
|---|---:|---|
| `T__` | 143 | `MeshToonMaterial` + 4 阶 `DataTexture` 渐变；主要物体加屏幕空间反向外壳描边 |
| `E__` | 53 | `MeshBasicMaterial` 自发光灯箱/霓虹；按名称做有限亮度提升 |
| `G__` | 2 | `MeshPhysicalMaterial` 透明玻璃，`depthWrite: false`，清漆 + 环境反射 |
| `P__` | 6 | `MeshPhysicalMaterial` 湿沥青/积水/湿漆/镜面；低粗糙度环境反射 |

描边在顶点着色器里把法线投影到裁剪空间，按像素偏移，所以远近物体的线宽一致；不是简单的世界空间壳层放缩。

### 运行时特效

- **雨**：900 条以内的 GPU `LineSegments`，片元按风速倾斜、循环下落；店面与雨棚范围内不生成雨柱。
- **积水波纹**：10 个环形网格，按相位扩散/淡出。
- **湿地反光**：手绘垂直渐变贴图 + 叠加混合的暖/冷色反光条，随灯光轻微呼吸。
- **自动门**：左右门玻璃和门框分别平移 ±0.32 m，带缓动和门口暖光增强。
- **刀旗灯箱**：每 12 秒一次短促闪烁。
- **信号灯**：绿 / 黄 / 红循环，非当前灯压暗。

## HFF 角色挂载

- 模型：`public/models/hff_v3.glb`；加载器：`src/hffCharacter.js`。
- 街道环境本身没有改动；`main.js` 只在街道初始化完成后调用一次 `attachHffCharacter(scene)`，失败时只记录错误并继续渲染街道。
- 脚底校准：在 `(x=0, z=2.8)` 向下对 `Sidewalk/Asphalt/Plinth` 材质做 raycast，命中 `SINGLE__Asphalt_bed`，街面高度 `y = 0`，角色脚底落在该高度。
- 缩放：加载后 `root.scale.setScalar(0.5)`，再用缩放后的包围盒重新算脚底和 XZ 中心；最终高度约 `0.675 m`，中心偏移约 `0.3375 m`。
- 几何原点 `(0, 0)` 正好在店面玻璃线上，直接放会穿玻璃；因此 X 保持居中，Z 向街面前移 **2.8 m**，给环绕镜头留出空间。需要别的站位时调用 `attachHffCharacter(scene, { centerZ: ... })`。
- 骨架探针：7 根骨骼 `Hips, Spine, Head, LeftArm, RightArm, LeftLeg, RightLeg`。
- 初始朝向由控制器的 `initialYaw`（默认 `Math.PI`）设置，角色面向店门；模型导出的局部 +Z 朝向没有改。
- `hff_v3.glb` 内 **0 个动画片段**，所以没有 AnimationAction；控制台会打印空的 Action 名称数组。`Strut Walking.fbx` 没有包含在这个 GLB 里，未做动画重定向；现在的动作完全由 `src/boneAnimator.js` 程序化驱动。
- 没有新增 Cannon 等物理引擎依赖；控制代码是 `src/thirdPersonController.js`，只依赖 Three.js 自带的 `THREE.Clock` / `Vector3`，`OrbitControls` 直接使用 Three.js 官方 addon。
- 第三人称镜头 FOV 为桌面 38°、竖屏 48°；`OrbitControls` 的 `maxPolarAngle` 为 85°，`minDistance/maxDistance` 为 `0.7/12`。
- 位移使用 Clock 的 delta（上限 0.1 s），旋转用帧率无关的指数阻尼；镜头位置不写死、不 `lerp` 到人物背后，只跟随人物位移平移。

### 程序化骨骼动画

没有使用 `AnimationMixer`，也没有 clip；`src/boneAnimator.js` 直接驱动 7 根骨骼：

- 进入时记录每根骨骼的 bind 姿态（rotation x/y/z 与 Hips 的 position.y），每帧先 `restoreBase()`，再叠加正弦偏移，所以动作不会累积、不会把模型扭坏。
- 时间来自控制器的 `THREE.Clock` delta 累加，使用 `Math.sin` / `Math.cos` 驱动，和渲染帧率无关。
- **待机**：Hips 上下呼吸、Spine 轻微起伏，Head 和双臂只做幅度很小的摆动。
- **走路**：LeftLeg / RightLeg 绕 X 轴反相摆动；LeftArm / RightArm 再与同侧腿反相，左腿向前时左臂向后；Hips 绕 Z 轴左右倾斜，并叠加一点 Y 轴扭动和步频二倍的上下 bob；Spine / Head 做反向摆动。
- **平滑过渡**：用 `walkWeight` 对 0/1 目标做指数 lerp（约 6.5/s），停止和起步都会在几帧内平滑收放幅度，不会瞬间切换。
- 只改变骨骼的 transform，不修改骨骼层级、蒙皮代码或内部网格；`R` / 双击复位时动画时间、幅度和骨骼姿态一并回到基准。

### 渲染

- Three.js r187，Vite 8，`WebGLRenderer` + `EffectComposer`
- ACES Filmic tone mapping，UnrealBloom（轻量），自定义 finish pass（暗角、轻微颗粒、饱和度/对比度）
- 4× MSAA HDR render target，DPR 上限 1.75
- 单盏 2048 阴影方向光；店内 2 点光 + 冷柜点光 + 门头暖光 + 街灯 SpotLight + 贩卖机冷光
- 没有贴图依赖；页面不加载外部字体或 CDN

## 文件

```
viewer/
  index.html
  src/main.js       场景、材质、灯光、描边、动画、后期
  src/hffCharacter.js  HFF 角色加载、脚底校准、骨架探针
  src/thirdPersonController.js  第三人称移动、转向、跟随镜头、动画接入
  src/boneAnimator.js  7 根骨骼的待机 / 走路程序化动画
  src/style.css     极简 HUD、加载页、响应式
  public/models/rainy_konbini.glb
  public/models/hff_v3.glb
  hff-third-person.png  第三人称镜头下的 1440 × 900 无 UI 截图
  hff-bone-animation.png  程序化行走姿态截图
  vite.config.js
  package.json
```

预览图：`preview.png`（1440 × 900，无 UI）与 `preview-ui.png`（带 HUD）；第三人称角色与跟随镜头见 `hff-third-person.png`；程序化骨骼的行走姿态见 `hff-bone-animation.png`。

## 备注

- 模型完全原创，品牌为虚构的 **ほしぞらマート / HOSHIZORA MART**。
- 原 Blender 场景保持 EEVEE Next + Shader-to-RGB 卡通材质；网页版不复用 Blender 的节点树，而是在浏览器里重建等效的 toon/自发光/玻璃/湿面材质。
- 当前 GLB 未做 Draco / meshopt 压缩，方便直接检查几何与节点；如需公网部署，建议在导出后加一步 gltf-transform meshopt 或 Draco。
