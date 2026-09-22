import type {
  EntityData,
  PositionMap,
  DataMap,
  SceneData,
  SpatialNode,
  VisualDataNode,
} from "../../entity/schema/types";

export class World {
  public activeSceneId: string = "";
  public entities: Map<string, EntityData> = new Map();
  public positionMap: PositionMap = new Map();
  public dataMap: DataMap = new Map();

  /**
   * 加载场景数据并映射为 PositionMap 与 DataMap
   */
  public loadScene(scene: SceneData, viewportWidth: number, viewportHeight: number): void {
    this.activeSceneId = scene.id;
    this.entities.clear();
    this.positionMap.clear();
    this.dataMap.clear();

    const halfW = viewportWidth / 2;
    const halfH = viewportHeight / 2;

    for (const [id, ent] of Object.entries(scene.entities)) {
      this.entities.set(id, ent);

      // 解析 Transform2D
      const transform = ent.components["Transform2D"]?.props || {
        position: { x: 0, y: 0 },
        z: 0,
        rotation: 0,
        scale: { x: 1, y: 1 },
        sortOrder: 0,
      };

      const worldX = halfW + transform.position.x;
      const worldY = halfH + transform.position.y;

      const spatial: SpatialNode = {
        local: {
          x: transform.position.x,
          y: transform.position.y,
          z: transform.z || 0,
          rotation: transform.rotation || 0,
          scaleX: transform.scale?.x ?? 1,
          scaleY: transform.scale?.y ?? 1,
        },
        world: {
          x: worldX,
          y: worldY,
          z: transform.z || 0,
          rotation: transform.rotation || 0,
          scaleX: transform.scale?.x ?? 1,
          scaleY: transform.scale?.y ?? 1,
        },
        sortKey: (transform.sortOrder || 0) * 1000 + worldY,
        bounds: {
          minX: worldX - 200,
          minY: worldY - 40,
          maxX: worldX + 200,
          maxY: worldY + 40,
        },
        inView: true,
      };
      this.positionMap.set(id, spatial);

      // 解析 VisualDataNode
      const widget = ent.components["UIWidget"]?.props;
      const visual: VisualDataNode = {
        tint: [1, 1, 1, 1],
        size: { width: 400, height: 80 },
        anchor: { x: 0.5, y: 0.5 },
        text: widget?.text || widget?.title,
        fontSize: widget?.fontSize || 16,
        dirty: true,
      };
      this.dataMap.set(id, visual);
    }
  }

  /**
   * 依据屏幕坐标执行反向空间拾取 (Hit-Testing)
   */
  public raycastEntity(screenX: number, screenY: number): string | null {
    // 逆序查找最上层实体
    const sorted = Array.from(this.positionMap.entries()).sort(
      (a, b) => b[1].sortKey - a[1].sortKey
    );

    for (const [id, node] of sorted) {
      const ent = this.entities.get(id);
      if (!ent || !ent.active) continue;

      const { minX, minY, maxX, maxY } = node.bounds;
      if (screenX >= minX && screenX <= maxX && screenY >= minY && screenY <= maxY) {
        return id;
      }
    }
    return null;
  }
}
