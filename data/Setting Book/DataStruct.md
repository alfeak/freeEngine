# freeEngine 基础数据结构设计规范 (DataStruct.md)

> **版本**：v0.1.0-alpha  
> **核心原则**：  
> 1. **全域统一契约 (Universal Data Contract)**：游戏运行时与游戏引擎 IDE（第 0 号游戏）**共用完全相同的一套底层数据结构**。  
> 2. **纯数据驱动 (Data-Oriented & Pure State)**：所有状态、实体、组件与配置均强类型化且 100% 可序列化为标准 JSON。  
> 3. **LLM 原生交互 (LLM-Native Patchable)**：结构自描述、低冗余、高可读性，支持大模型通过精简的 JSON Patch 直接读写与自愈修复。

---

## 1. 概念对齐：游戏与 IDE 的同构映射表

在 `freeEngine` 体系中，**IDE 本质上就是第一个使用该数据结构运行的 2.5D 复合游戏**。理解该数据结构的关键在于理解其双重角色的同构关系：

| 数据结构概念 | 在游戏中的表现 (In-Game) | 在 IDE 中的表现 (In-IDE) |
| :--- | :--- | :--- |
| **Project (工程)** | 一个独立的游戏项目（如：《地牢冒险 2.5D》） | IDE 工作区工程（包括编辑器配置与扩展插件） |
| **Scene (场景)** | 游戏关卡（如：第 1 关、主菜单场景） | 编辑器视口工作区（如：场景编辑器视口、UI 蓝图画布） |
| **Entity (实体)** | 玩家角色、Boss、火把光源、瓦片地图、弹幕粒子 | 场景树视口、属性面板 (Inspector)、资源浏览器窗口、悬浮菜单 |
| **Component (组件)** | 位置变换 (Transform)、精灵材质 (Sprite)、2.5D 光照 (Light) | 面板布局 (UILayout)、拖拽控制 (Draggable)、可停靠容器 (DockContainer) |
| **System (系统)** | 2.5D 渲染系统、光照阴影系统、碰撞物理系统 | 实体拾取与框选系统、属性反射检查系统、Gizmo 辅助轴渲染系统 |
| **Asset (资产)** | 纹理、法线图、WGSL 着色器、音效、预制体 (Prefab) | 布局主题、编辑器图标、扩展脚本、自定义面板模板 |

---

## 2. 工程与世界级数据结构 (Project & Scene Structure)

### 2.1 工程清单规范 (`ProjectManifest`)
每个 freeEngine 工程根目录下包含 `project.free.json`，由大模型或 IDE 读写：

```typescript
export interface ProjectManifest {
  /** 协议格式版本号 */
  schemaVersion: "1.0.0";
  /** 工程全局唯一标识 */
  id: string;
  /** 工程显示名称 */
  name: string;
  /** 初始版本号 */
  version: string;
  /** 入口场景资源 ID */
  entrySceneId: string;
  /** 渲染与窗口基础配置 */
  renderConfig: {
    targetResolution: { width: number; height: number };
    pixelArtMode: boolean; // 是否开启点阵像素完美对齐
    enableWebGPU: true;
    clearColor: [number, number, number, number]; // RGBA [0~1]
  };
  /** 资产清单路径或索引 */
  assetManifestPath: string;
  /** 启用的系统管线清单 */
  activeSystems: string[];
}
```

### 2.2 场景数据结构 (`SceneData`)
场景文件以 `.scene.json` 保存，描述场景的层次树与全局光照环境：

```typescript
export interface SceneData {
  id: string;
  name: string;
  /** 场景全局 2.5D 环境参数 */
  environment: {
    /** 环境全局光照 (Ambient Light) */
    ambientLight: {
      color: [number, number, number]; // RGB 归一化值 [0~1]
      intensity: number;               // 强度
    };
    /** 全局 2.5D 重力向量 [x, y, z] */
    gravity: [number, number, number];
    /** 阴影最大渲染距离与衰减系数 */
    shadowConfig: {
      maxDistance: number;
      softness: number;               // SDF 软阴影边缘柔和度
    };
  };
  /** 场景根节点实体列表 */
  rootEntityIds: string[];
  /** 场景内部所有实体的平面字典 (ID -> EntityData)，便于 O(1) 索引 */
  entities: Record<string, EntityData>;
}
```

---

## 3. 实体数据结构 (Entity Model)

实体是一个轻量级的逻辑容器，不包含任何业务方法，只包含标识、层级关系与组件挂载表。

```typescript
export interface EntityData {
  /** 实体唯一 UUID，格式推荐："ent_" + cuid/nanoid */
  id: string;
  /** 人类与 LLM 友好可读名称，如 "Player_Knight" 或 "Editor_InspectorPanel" */
  name: string;
  /** 状态标记：是否启用、是否在编辑器中隐藏、是否被锁定 */
  active: boolean;
  locked?: boolean;
  /** 分组与检索标签 */
  tags: string[];
  /** 渲染层级与物理层级掩码 */
  layer: number;
  /** 场景层级父子结构 */
  parentId: string | null;
  childrenIds: string[];
  /** 挂载的组件字典：Key 为 Component 的唯一类型名称 */
  components: Record<string, ComponentData>;
}
```

---

## 4. 核心组件契约 (Core Components Contract)

所有组件均遵循通用组件基类接口，以保证数据可遍历、自描述以及易于大模型直接生成。

```typescript
export interface ComponentData<T = any> {
  /** 组件类型标识符，如 "Transform2D", "SpriteRenderer", "Light2D" */
  type: string;
  /** 是否启用该组件 */
  enabled: boolean;
  /** 强类型的组件内部字段值 */
  props: T;
}
```

以下为 `freeEngine` 在 2.5D 与 IDE 混合环境下的核心预置组件规范：

### 4.1 空间变换组件 (`Transform2D`)
负责 2.5D 空间位置，包含虚拟高度 $Z$ 与遮挡排序因子。

```typescript
export interface Transform2DProps {
  /** 屏幕空间平面坐标 (X: 水平, Y: 垂直) */
  position: { x: number; y: number };
  /** 虚拟高度/深度 Z：用于 2.5D 光影遮挡、弹跳高度、景深计算 */
  z: number;
  /** 旋转角度（弧度制） */
  rotation: number;
  /** 缩放比例 */
  scale: { x: number; y: number };
  /** Y-Sorting 深度排序偏置值，保证立绘遮挡关系正确 */
  sortOrder: number;
}
```

### 4.2 2.5D 精灵渲染组件 (`SpriteRenderer`)
支持法线贴图高光与发光自遮罩。

```typescript
export interface SpriteRendererProps {
  /** 基础漫反射纹理资产 ID (Albedo Map) */
  textureId: string;
  /** 2.5D 法线贴图资产 ID (Normal Map，用于点光源计算立体高光) */
  normalMapId?: string;
  /** 自发光遮罩贴图资产 ID (Emission Map，用于霓虹/魔法发光) */
  emissionMapId?: string;
  /** 顶点染色 (RGBA，归一化 [0~1]) */
  tint: [number, number, number, number];
  /** 渲染锚点 (Pivot，默认 [0.5, 0.5] 居中) */
  anchor: { x: number; y: number };
  /** 水平/垂直翻转 */
  flipX: boolean;
  flipY: boolean;
  /** 自定义 WGSL 着色器引用（若使用默认管线则为空） */
  customShaderId?: string;
}
```

### 4.3 2.5D 动态光源组件 (`Light2D`)
WebGPU 延迟/前向混合光照管线的核心数据驱动源。

```typescript
export interface Light2DProps {
  /** 光源类型：点光源 (Point)、锥形聚光灯 (Spot)、定向日光 (Directional) */
  lightType: "point" | "spot" | "directional";
  /** 光源颜色 (RGB 归一化 [0~1]) */
  color: [number, number, number];
  /** 光照强度 */
  intensity: number;
  /** 光照有效作用半径 (像素单位) */
  radius: number;
  /** 虚拟高度 (Z 轴高度，决定法线入射角与阴影投射长度) */
  height: number;
  /** 聚光灯张角（仅聚光灯有效，单位弧度） */
  spotAngle?: number;
  /** 衰减指数 (Falloff Curve) */
  falloff: number;
  /** 是否向外投射实时 2.5D 阴影 */
  castShadow: boolean;
}
```

### 4.4 2D SDF 阴影投射遮挡体 (`ShadowCaster2D`)
配合 WebGPU 光照计算生成柔和阴影的遮光几何体。

```typescript
export interface ShadowCaster2DProps {
  /** 遮光多边形顶点列表（相对于实体原点的局部坐标，逆时针） */
  polygon: Array<{ x: number; y: number }>;
  /** 遮光体自身高度（用于判断高于或低于光源时的阴影遮挡比例） */
  height: number;
  /** 阴影不透明度 [0~1] */
  opacity: number;
}
```

### 4.5 WebGPU 粒子发射器组件 (`ComputeParticleEmitter`)
直接对接 WebGPU Compute Pipeline，在 GPU 上并行迭代数十万粒子。

```typescript
export interface ComputeParticleEmitterProps {
  /** 最大活跃粒子数量（显存分配基准，如 10000） */
  maxParticles: number;
  /** 粒子生命周期范围 [min, max] (秒) */
  lifetimeRange: [number, number];
  /** 初速度范围 [min, max] */
  speedRange: [number, number];
  /** 发射角范围（弧度制） */
  spreadAngleRange: [number, number];
  /** 颜色渐变阶梯 (Color Ramp: Keyframes of RGBA) */
  colorGradient: Array<{ offset: number; color: [number, number, number, number] }>;
  /** 粒子受风力与重力影响系数 */
  gravityScale: number;
  /** 绑定的 WebGPU Compute Shader 资产 ID */
  computeShaderId: string;
}
```

### 4.6 跨界 UI 与 IDE 核心组件 (`UILayout` & `UIWidget`)
**关键证明：IDE 面板与游戏 UI 共用这组组件**。

```typescript
export interface UILayoutProps {
  /** 布局锚点定位模式 */
  anchor: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "stretch" | "center";
  /** 外边距 / 偏移量 [top, right, bottom, left] */
  margin: [number, number, number, number];
  /** 固定或弹性宽高 (-1 表示自动撑满弹性父容器) */
  size: { width: number; height: number };
  /** 弹性盒流式排列规则 (针对容器实体) */
  flexDirection?: "row" | "column";
  gap?: number;
  /** 背景色与描边 */
  backgroundColor?: [number, number, number, number];
  borderColor?: [number, number, number, number];
  borderWidth?: number;
}

export interface UIWidgetProps {
  /** 控件功能类型 */
  widgetType: "panel" | "button" | "label" | "textInput" | "viewport" | "treeView";
  /** 文本内容（针对 Label / Button） */
  text?: string;
  /** 绑定的事件动作名称（由脚本或 System 监听消费） */
  actionEvent?: string;
  /** 是否可被鼠标抓取拖动（例如 IDE 的可移动停靠面板） */
  draggable?: boolean;
}
```

---

## 5. 资产索引契约 (Asset Manifest)

所有外部媒体、代码与配置统一由 `assets.free.json` 索引，为大模型提供清晰的资源指针：

```typescript
export type AssetType = 
  | "texture"          // 基础 2D 贴图 (PNG, WebP)
  | "normal_map"       // 2.5D 法线图
  | "shader_wgsl"      // WebGPU 渲染/计算着色器代码
  | "audio"            // 音效/BGM (MP3, OGG)
  | "scene"            // 场景 JSON
  | "prefab"           // 预制体 JSON（实体的离线模板）
  | "script_ts";       // 逻辑脚本 (TypeScript)

export interface AssetRecord {
  id: string;
  name: string;
  type: AssetType;
  /** 相对工程根目录的实际物理文件路径 */
  path: string;
  /** 资产元数据 */
  meta: {
    width?: number;
    height?: number;
    sizeBytes: number;
    /** LLM 生成记录追溯（支持提示词反查与再生成） */
    llmProvenance?: {
      prompt: string;
      modelName: string;
      createdAt: string;
    };
  };
}
```

---

## 6. 面向大模型的高效操作协议 (LLM Patch Protocol)

大模型在执行“增加怪物”、“调整全图光照”、“为 IDE 增加一个调试按钮”等指令时，不应传输整个冗长的场景文件，而应通过结构化的 **`EnginePatch`** 操作：

```typescript
export type EnginePatchOp = 
  | { op: "add_entity"; sceneId: string; entity: EntityData }
  | { op: "remove_entity"; sceneId: string; entityId: string }
  | { op: "update_component"; entityId: string; componentType: string; patchProps: Record<string, any> }
  | { op: "add_component"; entityId: string; component: ComponentData }
  | { op: "remove_component"; entityId: string; componentType: string };

export interface LLMChangeSet {
  author: "llm" | "human";
  description: string;
  patches: EnginePatchOp[];
}
```

### 示例：大模型添加一个“带有法线高光火把”的操作 Payload
```json
{
  "author": "llm",
  "description": "在入口大厅添加一盏带暖色光照与阴影投射的火把",
  "patches": [
    {
      "op": "add_entity",
      "sceneId": "scene_entrance",
      "entity": {
        "id": "ent_torch_01",
        "name": "WallTorch_Warm",
        "active": true,
        "tags": ["Interactable", "LightSource"],
        "layer": 1,
        "parentId": null,
        "childrenIds": [],
        "components": {
          "Transform2D": {
            "type": "Transform2D",
            "enabled": true,
            "props": {
              "position": { "x": 320, "y": 180 },
              "z": 12,
              "rotation": 0,
              "scale": { "x": 1, "y": 1 },
              "sortOrder": 5
            }
          },
          "SpriteRenderer": {
            "type": "SpriteRenderer",
            "enabled": true,
            "props": {
              "textureId": "asset_torch_diffuse",
              "normalMapId": "asset_torch_normal",
              "tint": [1, 1, 1, 1],
              "anchor": { "x": 0.5, "y": 1.0 },
              "flipX": false,
              "flipY": false
            }
          },
          "Light2D": {
            "type": "Light2D",
            "enabled": true,
            "props": {
              "lightType": "point",
              "color": [1.0, 0.65, 0.2],
              "intensity": 2.5,
              "radius": 240,
              "height": 16,
              "falloff": 1.5,
              "castShadow": true
            }
          }
        }
      }
    }
  ]
}
```

---

## 7. 实体预制体格式 (`PrefabData`)

预制体（Prefab）是实体的可复用模板，用于批量生成敌人、子弹道具，或**复用 IDE 工具栏、弹窗模板**：

```typescript
export interface PrefabData {
  id: string;
  name: string;
  /** 根实体结构模板 */
  root: EntityData;
  /** 嵌套子实体平铺字典 */
  subEntities: Record<string, EntityData>;
}
```

---

## 8. 核心运行期映射契约 (Runtime Maps & Router Contracts)

详见配套规范文档 [DataFlow.md](file:///d:/software/platform/freeEngine/DataFlow.md)。在运行期，前端所有画面均被映射分解为 **`PositionMap`** 与 **`DataMap`**：

```typescript
/** 空间几何与投影节点（由 Transform2D、Camera 与物理驱动更新） */
export interface SpatialNode {
  local: { x: number; y: number; z: number; rotation: number; scaleX: number; scaleY: number };
  world: { x: number; y: number; z: number; rotation: number; scaleX: number; scaleY: number };
  sortKey: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  inView: boolean;
}

/** 表现层与材质属性节点（由 SpriteRenderer、Light2D 等组件驱动更新） */
export interface VisualDataNode {
  textureAssetId?: string;
  normalMapAssetId?: string;
  emissionMapAssetId?: string;
  materialParams: Float32Array;
  lightData?: {
    type: "point" | "spot" | "directional";
    color: [number, number, number];
    intensity: number;
    radius: number;
    castShadow: boolean;
  };
  customUniforms?: Record<string, number | number[]>;
  uvOffset: [number, number, number, number];
  dirty: boolean;
}

/** 实体 ID 到空间节点的全局映射表 */
export type PositionMap = Map<string, SpatialNode>;

/** 实体 ID 到表现数据的全局映射表 */
export type DataMap = Map<string, VisualDataNode>;
```

---

## 9. 总结与后续演进

1. **同构价值**：此数据结构设计使得无论是游戏运行逻辑（2.5D 弹幕对战），还是 IDE 内部逻辑（场景树列表联动 Inspector 反射组件属性），都在同一套 `Entity + Component` 状态总线上流转。
2. **零阻抗接入 WebGPU**：通过核心路由器（Core Router），`PositionMap` 与 `DataMap` 会被高效编译为 WebGPU 的 Uniform/Storage Buffers 与 BindGroups，实现全自动化着色渲染，详见 [DataFlow.md](file:///d:/software/platform/freeEngine/DataFlow.md)。
3. **下一步行动**：在第一阶段脚手架中，将此规范以 TypeScript 强类型接口文件落地至 `packages/engine-core/src/schema/`。

