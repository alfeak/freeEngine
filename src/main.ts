import "./style.css";
import { CoreRouter } from "../data/logits/router/CoreRouter";

window.addEventListener("DOMContentLoaded", async () => {
  const canvas = document.getElementById("engine-canvas") as HTMLCanvasElement;
  const uiOverlay = document.getElementById("ui-overlay") as HTMLDivElement;

  if (!canvas || !uiOverlay) {
    console.error("[freeEngine] Failed to locate #engine-canvas or #ui-overlay elements.");
    return;
  }

  console.log("==========================================");
  console.log("   freeEngine 2.5D WebGPU Runtime Boot    ");
  console.log("   Frontend IS the Game • LLM-Native      ");
  console.log("==========================================");

  const router = new CoreRouter(canvas, uiOverlay);
  await router.init();

  // 挂载到全局调试对象 (debug=on)
  (window as any).__FREE_ENGINE_ROUTER__ = router;
});
