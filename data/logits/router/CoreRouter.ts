import type { EngineLockConfig, RouterIOEvent } from "../../entity/schema/types";
import { World } from "../ecs/World";
import { PackerService, PackResult } from "../packager/PackerService";
import welcomeSceneData from "../../scenes/welcome.scene.json";
import welcomeShaderCode from "../../shaders/welcome_bg.wgsl?raw";

export type EngineState = "welcome" | "transitioning" | "project_setup" | "workspace";

export class CoreRouter {
  private canvas: HTMLCanvasElement;
  private uiOverlay: HTMLDivElement;
  public world: World;
  public lock: EngineLockConfig = { debug: true, packing: true };

  // 项目元信息
  public projectName: string = "My25DGame";
  public projectPath: string = "D:/freeEngineProjects/My25DGame";

  // WebGPU 核心硬件状态
  private adapter: GPUAdapter | null = null;
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private pipeline: GPURenderPipeline | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private presentationFormat: GPUTextureFormat = "bgra8unorm";

  // 状态机与过渡动效
  public currentState: EngineState = "welcome";
  private transitionProgress: number = 0;
  private transitionStartTime: number = 0;
  private readonly transitionDuration: number = 900; // 900ms 转场

  private startTime: number = performance.now();
  private mousePos = { x: 0.5, y: 0.5 };
  private isWebGPUAvailable: boolean = false;

  // Packing 状态
  private isPackingActive: boolean = false;
  private packLogs: string[] = [];
  private packCurrentStep: number = 0;
  private packResult: PackResult | null = null;

  constructor(canvas: HTMLCanvasElement, uiOverlay: HTMLDivElement) {
    this.canvas = canvas;
    this.uiOverlay = uiOverlay;
    this.world = new World();
  }

  /**
   * 初始化核心路由器：配置 WebGPU 上下文与反向 IO
   */
  public async init(): Promise<void> {
    this.setupIO();
    this.handleResize();
    window.addEventListener("resize", () => this.handleResize());

    // 尝试初始化 WebGPU
    try {
      if ("gpu" in navigator && navigator.gpu) {
        this.adapter = await navigator.gpu.requestAdapter({
          powerPreference: "high-performance",
        });
        if (this.adapter) {
          this.device = await this.adapter.requestDevice();
          this.context = this.canvas.getContext("webgpu") as GPUCanvasContext;
          this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();
          this.context.configure({
            device: this.device,
            format: this.presentationFormat,
            alphaMode: "premultiplied",
          });
          await this.compileWebGPUPipeline();
          this.isWebGPUAvailable = true;
          console.log("[CoreRouter] WebGPU Pipeline successfully compiled.");
        }
      }
    } catch (e) {
      console.warn("[CoreRouter] WebGPU initialization notice:", e);
      this.isWebGPUAvailable = false;
    }

    // 初始载入欢迎场景
    this.loadSceneForState();

    // 启动主驱动循环
    requestAnimationFrame((t) => this.renderLoop(t));
  }

  /**
   * 编译 WebGPU 动态着色管线
   */
  private async compileWebGPUPipeline(): Promise<void> {
    if (!this.device) return;

    const shaderModule = this.device.createShaderModule({
      label: "Welcome_Background_Shader",
      code: welcomeShaderCode,
    });

    this.uniformBuffer = this.device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.pipeline = this.device.createRenderPipeline({
      label: "Welcome_RenderPipeline",
      layout: "auto",
      vertex: {
        module: shaderModule,
        entryPoint: "vs_main",
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_main",
        targets: [{ format: this.presentationFormat }],
      },
      primitive: {
        topology: "triangle-list",
      },
    });

    this.bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: { buffer: this.uniformBuffer },
        },
      ],
    });
  }

  /**
   * 根据当前状态载入场景并刷新 UI
   */
  private loadSceneForState(): void {
    if (this.currentState === "welcome" || this.currentState === "transitioning") {
      this.world.loadScene(welcomeSceneData as any, this.canvas.width, this.canvas.height);
    } else {
      // workspace / project_setup 保持纯净
      this.world.entities.clear();
      this.world.positionMap.clear();
      this.world.dataMap.clear();
    }
    this.renderUIOverlay();
  }

  /**
   * 启动场景转场
   */
  public startTransition(): void {
    if (this.currentState !== "welcome") return;
    this.currentState = "transitioning";
    this.transitionStartTime = performance.now();
    this.renderUIOverlay();
  }

  /**
   * 反向 IO 交互监听与空间拾取
   */
  private setupIO(): void {
    const handlePointer = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      this.mousePos.x = x / rect.width;
      this.mousePos.y = y / rect.height;

      // 仅在欢迎界面点击时触发转场
      if (e.type === "pointerdown" && this.currentState === "welcome") {
        this.startTransition();
      }
    };

    window.addEventListener("pointerdown", handlePointer);
    window.addEventListener("pointermove", handlePointer);
  }

  private handleResize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;

    this.loadSceneForState();
  }

  /**
   * 主渲染与调度闭环
   */
  private renderLoop(timeMs: number): void {
    const elapsed = (timeMs - this.startTime) / 1000;

    // 处理转场动效进度
    if (this.currentState === "transitioning") {
      const progress = (timeMs - this.transitionStartTime) / this.transitionDuration;
      this.transitionProgress = Math.min(1.0, progress);

      if (this.transitionProgress >= 1.0) {
        this.currentState = "project_setup";
        this.transitionProgress = 0;
        this.loadSceneForState();
      }
    }

    // 正向渲染编译：向 WebGPU 发送指令
    if (this.isWebGPUAvailable && this.device && this.context && this.pipeline && this.uniformBuffer && this.bindGroup) {
      const isWorkspace = this.currentState === "workspace";
      // 在 workspace 模式下背景保持优雅极简微光
      const speedFactor = isWorkspace ? 0.2 : 1.0;

      const uniformData = new Float32Array([
        this.canvas.width,
        this.canvas.height,
        elapsed * speedFactor,
        this.currentState === "workspace" ? 0.85 : this.transitionProgress,
        this.mousePos.x,
        this.mousePos.y,
        0, 0
      ]);
      this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);

      const commandEncoder = this.device.createCommandEncoder({ label: "Frame_CommandEncoder" });
      const textureView = this.context.getCurrentTexture().createView();

      const clearBg = isWorkspace
        ? { r: 0.04, g: 0.05, b: 0.08, a: 1.0 }
        : { r: 0.02, g: 0.03, b: 0.07, a: 1.0 };

      const passEncoder = commandEncoder.beginRenderPass({
        colorAttachments: [
          {
            view: textureView,
            clearValue: clearBg,
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });

      passEncoder.setPipeline(this.pipeline);
      passEncoder.setBindGroup(0, this.bindGroup);
      passEncoder.draw(6, 1, 0, 0);
      passEncoder.end();

      this.device.queue.submit([commandEncoder.finish()]);
    } else {
      this.renderFallbackCanvas(elapsed);
    }

    requestAnimationFrame((t) => this.renderLoop(t));
  }

  private renderFallbackCanvas(t: number): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = this.currentState === "workspace" ? "#07090f" : "#080a14";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.currentState === "welcome") {
      ctx.strokeStyle = "rgba(45, 130, 255, 0.25)";
      ctx.lineWidth = 1;
      const w = this.canvas.width;
      const h = this.canvas.height;
      const horizon = h * 0.55;

      for (let x = 0; x < w; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x, horizon);
        ctx.lineTo(w / 2 + (x - w / 2) * 3, h);
        ctx.stroke();
      }
    }
  }

  /**
   * 触发 Packing 打包流水线
   */
  public async triggerPacking(): Promise<void> {
    this.isPackingActive = true;
    this.packLogs = [];
    this.packCurrentStep = 0;
    this.packResult = null;
    this.renderUIOverlay();

    const result = await PackerService.executePack(
      this.projectName,
      this.projectPath,
      (step, total, msg) => {
        this.packCurrentStep = step;
        this.packLogs.push(msg);
        this.renderUIOverlay();
      }
    );

    this.packResult = result;
    this.renderUIOverlay();
  }

  /**
   * 渲染前端 DOM UI 浮层
   */
  private renderUIOverlay(): void {
    if (this.currentState === "welcome" || this.currentState === "transitioning") {
      const opacity = this.currentState === "transitioning" ? 1 - this.transitionProgress : 1;
      this.uiOverlay.innerHTML = `
        <div class="welcome-container" style="opacity: ${opacity}; transition: opacity 0.3s ease;">
          <div class="engine-badge">
            <span class="badge-dot"></span>
            <span>NEXT-GEN 2.5D WEBGPU RUNTIME</span>
          </div>
          <h1 class="engine-title">FREE ENGINE</h1>
          <p class="engine-tagline">前端即游戏 • 面向大模型自举架构 • 毫秒级热更</p>
          
          <div class="start-prompt">
            <span class="prompt-icon">⚡</span>
            <span class="prompt-text">点击任意区域进入引擎控制台</span>
          </div>

          <div class="specs-bar">
            <span>WebGPU: ${this.isWebGPUAvailable ? "🟢 ACTIVE (D3D12/Metal)" : "🟡 SIMULATED"}</span>
            <span>Mode: IDE (debug=on, packing=on)</span>
            <span>Version: v0.1.0-alpha</span>
          </div>
        </div>
      `;
    } else if (this.currentState === "project_setup") {
      // 阶段 1: 选定项目位置与项目名称
      this.uiOverlay.innerHTML = `
        <div class="setup-container">
          <div class="setup-card">
            <div class="setup-header">
              <span class="setup-icon">◈</span>
              <h2>初始化 freeEngine 项目</h2>
              <p>请选定项目名称与本地工作区存放路径</p>
            </div>

            <div class="form-group">
              <label for="input-proj-name">项目名称 (Project Name)</label>
              <div class="input-wrapper">
                <input id="input-proj-name" type="text" value="${this.projectName}" placeholder="例如：My25DGame" />
              </div>
            </div>

            <div class="form-group">
              <label for="input-proj-path">存储位置 (Project Location)</label>
              <div class="input-wrapper">
                <input id="input-proj-path" type="text" value="${this.projectPath}" placeholder="例如：D:/freeEngineProjects/My25DGame" />
              </div>
            </div>

            <div class="setup-actions">
              <button class="btn-cancel" id="btn-cancel-setup">◀ 返回欢迎页</button>
              <button class="btn-primary" id="btn-enter-workspace">进入工作区 (Open Workspace) ▶</button>
            </div>
          </div>
        </div>
      `;

      // 绑定项目表单事件
      const nameInput = document.getElementById("input-proj-name") as HTMLInputElement;
      const pathInput = document.getElementById("input-proj-path") as HTMLInputElement;

      document.getElementById("btn-enter-workspace")?.addEventListener("click", () => {
        if (nameInput?.value.trim()) {
          this.projectName = nameInput.value.trim();
        }
        if (pathInput?.value.trim()) {
          this.projectPath = pathInput.value.trim();
        }
        this.currentState = "workspace";
        this.loadSceneForState();
      });

      document.getElementById("btn-cancel-setup")?.addEventListener("click", () => {
        this.currentState = "welcome";
        this.loadSceneForState();
      });
    } else if (this.currentState === "workspace") {
      // 阶段 2: 保持界面为空！仅保留顶栏与核心 Packing 操作
      const packingModal = this.isPackingActive
        ? `
        <div class="modal-backdrop">
          <div class="packing-modal">
            <div class="modal-header">
              <div class="modal-title">
                <span class="spin-icon">⚙</span>
                <span>freeEngine Packing 管线执行中...</span>
              </div>
              ${this.packResult ? `<button class="modal-close-btn" id="btn-close-pack">✕</button>` : ""}
            </div>

            <div class="pack-progress-bar">
              <div class="bar-fill" style="width: ${(this.packCurrentStep / 6) * 100}%"></div>
            </div>

            <div class="pack-terminal-box">
              ${this.packLogs.map((log) => `<div class="pack-log-line">${log}</div>`).join("")}
              ${
                this.packResult
                  ? `
                  <div class="pack-success-banner">
                    <div class="banner-title">✔ Packing 打包完成！已生成标准独立安装包</div>
                    <div class="banner-path">目标位置: <strong>${this.packResult.relativeDir}</strong></div>
                    <div class="file-checklist">
                      ${(this.packResult.files || []).map((f) => `<div class="check-item">✔ ${f}</div>`).join("")}
                    </div>
                  </div>
                `
                  : ""
              }
            </div>

            <div class="modal-footer">
              ${
                this.packResult
                  ? `<button class="btn-primary" id="btn-done-pack">完成并返回工作区</button>`
                  : `<span class="packing-hint">正在向 dist/ 目录构建独立游戏安装制品...</span>`
              }
            </div>
          </div>
        </div>
      `
        : "";

      this.uiOverlay.innerHTML = `
        <div class="workspace-wrapper">
          <!-- 极简顶栏 -->
          <header class="workspace-header">
            <div class="header-left">
              <span class="logo">◈ freeEngine</span>
              <div class="project-info">
                <span class="p-name">${this.projectName}</span>
                <span class="p-path">${this.projectPath}</span>
              </div>
            </div>

            <div class="header-right">
              <div class="lock-indicator">
                <span class="lock-title">ENGINE DUAL-LOCK</span>
                <span class="badge-lock on">debug: ON</span>
                <span class="badge-lock on">packing: ON</span>
              </div>

              <!-- 核心 PACKING 动作按钮 -->
              <button class="btn-pack-primary" id="btn-trigger-packing">
                <span class="btn-icon">⚡</span>
                <span class="btn-text">Packing (打包发布)</span>
              </button>

              <button class="btn-switch-proj" id="btn-switch-proj" title="切换或新建项目">
                切换项目
              </button>
            </div>
          </header>

          <!-- 主界面保持为空白视口 -->
          <main class="workspace-empty-view">
            <div class="empty-hint">
              <span class="hint-dot"></span>
              <span>2.5D WebGPU 空白工作区已就绪 • 点击右上角「Packing」即可在 dist 中打包独立安装包</span>
            </div>
          </main>

          <!-- 打包进度弹窗 -->
          ${packingModal}
        </div>
      `;

      // 绑定 Packing 与切换项目事件
      document.getElementById("btn-trigger-packing")?.addEventListener("click", () => {
        this.triggerPacking();
      });

      document.getElementById("btn-switch-proj")?.addEventListener("click", () => {
        this.currentState = "project_setup";
        this.loadSceneForState();
      });

      document.getElementById("btn-close-pack")?.addEventListener("click", () => {
        this.isPackingActive = false;
        this.renderUIOverlay();
      });

      document.getElementById("btn-done-pack")?.addEventListener("click", () => {
        this.isPackingActive = false;
        this.renderUIOverlay();
      });
    }
  }
}
