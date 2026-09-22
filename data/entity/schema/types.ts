/**
 * freeEngine 核心数据契约
 * 统一适用于游戏运行时与自举 IDE (Game #0)
 */

export interface EngineLockConfig {
  debug: boolean;
  packing: boolean;
}

export interface SpatialNode {
  /** 局部变换 */
  local: {
    x: number;
    y: number;
    z: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
  };
  /** 世界坐标矩阵与投影结果 */
  world: {
    x: number;
    y: number;
    z: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
  };
  /** 2.5D 深度排序因子 (结合 Y 坐标与 Z 高度) */
  sortKey: number;
  /** 轴对齐边界盒 (AABB, 供 IO 点击拾取与视口剔除) */
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  /** 是否位于当前活动视口摄像机视野内 */
  inView: boolean;
}

export type PositionMap = Map<string, SpatialNode>;

export interface VisualDataNode {
  /** 材质或纹理引用 */
  textureAssetId?: string;
  normalMapAssetId?: string;
  emissionMapAssetId?: string;
  /** 基础染色 RGBA [0~1] */
  tint: [number, number, number, number];
  /** 尺寸与锚点 */
  size: { width: number; height: number };
  anchor: { x: number; y: number };
  /** 2.5D 光照数据 */
  lightData?: {
    type: "point" | "spot" | "directional";
    color: [number, number, number];
    intensity: number;
    radius: number;
    castShadow: boolean;
  };
  /** 自定义 WGSL Uniform 参数 */
  customUniforms?: Record<string, number | number[]>;
  /** 文本内容（若为 UI 文本部件） */
  text?: string;
  fontSize?: number;
  /** 脏标记：指示是否需要在当前帧重写 GPU 缓冲区 */
  dirty: boolean;
}

export type DataMap = Map<string, VisualDataNode>;

export interface ComponentData<T = any> {
  type: string;
  enabled: boolean;
  props: T;
}

export interface EntityData {
  id: string;
  name: string;
  active: boolean;
  tags: string[];
  layer: number;
  parentId: string | null;
  childrenIds: string[];
  components: Record<string, ComponentData>;
}

export interface SceneData {
  id: string;
  name: string;
  environment: {
    ambientLight: {
      color: [number, number, number];
      intensity: number;
    };
    gravity: [number, number, number];
    clearColor: [number, number, number, number];
  };
  rootEntityIds: string[];
  entities: Record<string, EntityData>;
}

export type RouterEventType = "click" | "pointerdown" | "pointerup" | "pointermove" | "keydown";

export interface RouterIOEvent {
  type: RouterEventType;
  screenPos: { x: number; y: number };
  worldPos: { x: number; y: number; z: number };
  targetEntityId: string | null;
  originalEvent: Event;
}
